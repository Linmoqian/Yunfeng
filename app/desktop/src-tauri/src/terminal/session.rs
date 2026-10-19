//! 本机 PTY 生命周期；阻塞读写在受限会话内，错误不返回系统细节。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use super::model::{error, Chunk, Output, Result, Size};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub struct Session {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    output: Arc<Mutex<Output>>,
    reader: Mutex<Option<JoinHandle<()>>>,
    agent: bool,
}
fn pty_size(size: Size) -> PtySize {
    PtySize {
        rows: size.rows,
        cols: size.cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

impl Session {
    pub fn start(size: Size) -> Result<Self> {
        let mut command = CommandBuilder::new_default_prog();
        if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
            command.cwd(home);
        }
        Self::spawn(size, command, false)
    }
    pub fn command(cwd: &str, script: &str) -> Result<Self> {
        if script.is_empty() || script.len() > 16 * 1024 || script.contains('\0') {
            return Err(error("INVALID_INPUT", "命令需为 1 至 16384 字节"));
        }
        let cwd = std::fs::canonicalize(cwd)
            .ok()
            .filter(|path| path.is_dir())
            .ok_or_else(|| error("INVALID_INPUT", "工作目录不可用"))?;
        if !cfg!(unix) {
            return Err(error(
                "UNSUPPORTED",
                "Agent 内置终端当前仅支持 macOS 和 Linux",
            ));
        }
        let mut command = CommandBuilder::new("/bin/bash");
        command.args(["-lc", script]);
        command.cwd(cwd);
        Self::spawn(
            Size {
                cols: 100,
                rows: 30,
            },
            command,
            true,
        )
    }
    pub fn program(cwd: &str, program: &str, args: &[String]) -> Result<Self> {
        if program.is_empty()
            || program.len() > 500
            || program.contains('\0')
            || args.len() > 32
            || args
                .iter()
                .any(|arg| arg.len() > 8000 || arg.contains('\0'))
        {
            return Err(error("INVALID_INPUT", "科研程序或参数无效"));
        }
        if !cfg!(unix) {
            return Err(error(
                "UNSUPPORTED",
                "科研内置终端当前仅支持 macOS 和 Linux",
            ));
        }
        let cwd = std::fs::canonicalize(cwd)
            .ok()
            .filter(|p| p.is_dir())
            .ok_or_else(|| error("INVALID_INPUT", "工作目录不可用"))?;
        let mut command = CommandBuilder::new(program);
        command.args(args);
        command.cwd(cwd);
        Self::spawn(
            Size {
                cols: 100,
                rows: 30,
            },
            command,
            true,
        )
    }
    fn spawn(size: Size, mut command: CommandBuilder, agent: bool) -> Result<Self> {
        let size = size.validate()?;
        let pair = native_pty_system()
            .openpty(pty_size(size))
            .map_err(|_| error("START_FAILED", "无法创建本机终端"))?;
        command.env("TERM", "xterm-256color");
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|_| error("START_FAILED", "无法读取终端"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|_| error("START_FAILED", "无法写入终端"))?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|_| error("START_FAILED", "无法启动默认 Shell"))?;
        drop(pair.slave);
        let output = Arc::new(Mutex::new(Output::default()));
        let target = output.clone();
        let thread = std::thread::Builder::new()
            .name("yunfeng-pty-output".into())
            .spawn(move || {
                let mut bytes = [0; 8192];
                loop {
                    let read = reader.read(&mut bytes);
                    let Ok(mut output) = target.lock() else {
                        break;
                    };
                    match read {
                        Ok(0) => {
                            output.closed = true;
                            break;
                        }
                        Ok(count) => output.append(&bytes[..count]),
                        Err(_) => {
                            output.closed = true;
                            output.failed = true;
                            break;
                        }
                    }
                }
            });
        let reader = match thread {
            Ok(reader) => reader,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error("START_FAILED", "无法启动终端读取任务"));
            }
        };
        Ok(Self {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            output,
            reader: Mutex::new(Some(reader)),
            agent,
        })
    }
    pub fn read(&self, cursor: u64) -> Result<Chunk> {
        let mut chunk = self
            .output
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端输出不可用"))?
            .read(cursor)?;
        chunk.agent = self.agent;
        chunk.exit_code = self
            .child
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端不可用"))?
            .try_wait()
            .map_err(|_| error("STATE_ERROR", "无法读取进程状态"))?
            .map(|status| status.exit_code());
        Ok(chunk)
    }
    pub fn write(&self, data: &str) -> Result<()> {
        if self.agent {
            return Err(error("FORBIDDEN", "Agent 作业终端只读"));
        }
        if data.is_empty() || data.len() > 16 * 1024 {
            return Err(error("INVALID_INPUT", "终端输入需为 1 至 16384 字节"));
        }
        // 拒绝并行写入，避免调用堆积和输入交错。
        let mut writer = self
            .writer
            .try_lock()
            .map_err(|_| error("BUSY", "终端正在处理输入"))?;
        writer
            .write_all(data.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|_| error("WRITE_FAILED", "终端输入失败，请停止后重新启动"))
    }
    pub fn resize(&self, size: Size) -> Result<()> {
        let size = size.validate()?;
        self.master
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端不可用"))?
            .resize(pty_size(size))
            .map_err(|_| error("RESIZE_FAILED", "无法调整终端尺寸"))
    }
    pub fn stop(&self) -> Result<()> {
        let mut child = self
            .child
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端不可用"))?;
        let running = child
            .try_wait()
            .map_err(|_| error("STOP_FAILED", "无法读取终端进程状态"))?
            .is_none();
        let reading = self
            .reader
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端不可用"))?
            .as_ref()
            .is_some_and(|thread| !thread.is_finished());
        // Shell 可能先于仍占用 PTY 的子进程退出；取消仍须终止该进程组。
        if running || reading {
            #[cfg(unix)]
            {
                let foreground = self
                    .master
                    .lock()
                    .ok()
                    .and_then(|master| master.process_group_leader());
                for pid in [
                    foreground,
                    child.process_id().and_then(|id| i32::try_from(id).ok()),
                ]
                .into_iter()
                .flatten()
                {
                    if pid > 1 {
                        // SAFETY: 正数 PID 来自本会话 PTY 和其子进程，负号只选择该进程组。
                        unsafe {
                            libc::kill(-pid, libc::SIGKILL);
                        }
                    }
                }
            }
            if running && child.kill().is_err() && child.try_wait().ok().flatten().is_none() {
                return Err(error("STOP_FAILED", "无法停止终端进程"));
            }
            child
                .wait()
                .map_err(|_| error("STOP_FAILED", "无法回收终端进程"))?;
        }
        drop(child);
        let mut reader = self
            .reader
            .lock()
            .map_err(|_| error("STATE_ERROR", "终端不可用"))?;
        let deadline = Instant::now() + Duration::from_secs(2);
        while reader.as_ref().is_some_and(|thread| !thread.is_finished())
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(10));
        }
        if reader.as_ref().is_some_and(|thread| !thread.is_finished()) {
            return Err(error("STOP_FAILED", "终端仍有任务占用，请稍后重试关闭"));
        }
        if let Some(reader) = reader.take() {
            reader
                .join()
                .map_err(|_| error("STOP_FAILED", "终端读取任务退出失败"))?;
        }
        Ok(())
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn pty_roundtrip_resize_and_foreground_cancellation() {
        let session = Session::start(Size { cols: 80, rows: 24 }).unwrap();
        assert!(session.write("").is_err());
        assert!(session.write(&"x".repeat(16385)).is_err());
        session
            .resize(Size {
                cols: 100,
                rows: 30,
            })
            .unwrap();
        session
            .write("printf 'YF_%s\\n' 'PTY_云枫'; sleep 30\r")
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let chunk = session.read(0).unwrap();
            if String::from_utf8_lossy(&chunk.data).contains("YF_PTY_云枫") {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "PTY did not produce expected output"
            );
            std::thread::yield_now();
        }
        session.stop().unwrap();
        assert!(session.read(0).unwrap().closed);
        session.stop().unwrap();
    }
}
