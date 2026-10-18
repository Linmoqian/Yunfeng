//! 基准专用 stdin/stdout JSON 行入口；仅操作显式临时目录，不注册桌面或 Agent 接口。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;
use yunfeng_research_kernel::{files, store::GraphStore, Result};
mod worker_experiment;
struct Worker {
    root: PathBuf,
    task: Value,
    store: GraphStore,
}
impl Worker {
    fn new(root: PathBuf, resume: bool) -> Result<Self> {
        let seed: Value = serde_json::from_slice(&fs::read(root.join("task.json"))?)?;
        if !resume {
            GraphStore::new(&root.join("data"))?.save(&seed)?;
        }
        let store = GraphStore::new(&root.join("data"))?;
        let task = store.read(seed["id"].as_str().ok_or("缺少任务身份")?)?;
        Ok(Self { root, task, store })
    }
    fn call(&mut self, request: &Value) -> Result<Value> {
        let path = || request["path"].as_str().ok_or("缺少路径");
        let at = request["at"].as_str().unwrap_or("2026-10-18T00:00:00.000Z");
        match request["op"].as_str() {
            Some("ping") => Ok(request["payload"].clone()),
            Some("read") => Ok(files::read_text(&self.root, path()?)?.into()),
            Some("evaluate") => Ok(files::evaluate(&self.root, &request["condition"])
                .unwrap_or_else(|_| json!({"passed":false}))),
            Some("write") => {
                files::write_text(
                    &self.root,
                    path()?,
                    request["content"].as_str().ok_or("缺少内容")?,
                )?;
                files::evaluate(&self.root, &request["condition"])
            }
            Some("checkpoint") => {
                let mut next = self.task.clone();
                next["autonomy"]["reason"] = request["reason"].clone();
                for key in ["phase", "cycle"] {
                    if let Some(value) = request.get(key) {
                        next["autonomy"][key] = value.clone();
                    }
                }
                if let Some(status) = request.get("nodeStatus") {
                    next["autonomy"]["decision"]["nodes"][0]["status"] = status.clone();
                }
                next["updatedAt"] = at.into();
                self.store.save(&next)?;
                self.task = next;
                Ok(Value::Null)
            }
            Some("event") => {
                let id = self.task["id"].as_str().ok_or("缺少任务身份")?;
                let seq = self.task["lastEventSeq"].as_u64().ok_or("缺少事件游标")? + 1;
                let phase = request
                    .get("phase")
                    .cloned()
                    .unwrap_or_else(|| json!("WAITING"));
                let event = json!({"id":uuid::Uuid::new_v4().to_string(),"taskId":id,"seq":seq,"occurredAt":at,"type":"task_updated","data":{"phase":phase}});
                let folder = self.root.join("data/tasks").join(id);
                fs::create_dir_all(&folder)?;
                let mut file = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(folder.join("events.jsonl"))?;
                let mut encoded = serde_json::to_vec(&event)?;
                encoded.push(b'\n');
                file.write_all(&encoded)?;
                drop(file);
                self.store.save_cursor(id, seq, at)?;
                self.task["lastEventSeq"] = seq.into();
                self.task["updatedAt"] = at.into();
                Ok(json!({"seq":seq}))
            }
            Some("experiment") => worker_experiment::run(&self.root),
            Some("snapshot") => self
                .store
                .read(self.task["id"].as_str().ok_or("缺少任务身份")?),
            _ => Err("不支持的基准操作".into()),
        }
    }
}
fn main() -> Result<()> {
    if std::env::args().nth(1).as_deref() == Some("--info") {
        println!("{}", json!({"sqlite":rusqlite::version()}));
        return Ok(());
    }
    if std::env::args().nth(1).as_deref() == Some("--inspect") {
        let root = PathBuf::from(std::env::args().nth(2).ok_or("需要临时目录")?);
        let task: Value = serde_json::from_slice(&fs::read(root.join("task.json"))?)?;
        println!(
            "{}",
            GraphStore::new(&root.join("data"))?.read(task["id"].as_str().ok_or("缺少身份")?)?
        );
        return Ok(());
    }
    if std::env::args().nth(1).as_deref() == Some("--noop") {
        print!("ok");
        return Ok(());
    }
    let root = std::env::args().nth(1).ok_or("需要独立临时目录")?;
    let mut worker = Worker::new(
        fs::canonicalize(Path::new(&root))?,
        std::env::args().nth(2).as_deref() == Some("--resume"),
    )?;
    let mut output = io::BufWriter::new(io::stdout().lock());
    writeln!(output, "{{\"ready\":true}}")?;
    output.flush()?;
    let mut input = io::stdin().lock();
    loop {
        let mut line = vec![];
        let count = (&mut input)
            .take(1024 * 1024 + 1)
            .read_until(b'\n', &mut line)?;
        if count == 0 {
            break;
        }
        if count > 1024 * 1024 || line.last() != Some(&b'\n') {
            return Err("基准请求超过上限或不完整".into());
        }
        let request: Value = serde_json::from_slice(&line)?;
        let start = Instant::now();
        let value = worker.call(&request);
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        let response = match value {
            Ok(value) => json!({"ok":true,"value":value,"innerMs":elapsed}),
            Err(_) => json!({"ok":false,"code":"REJECTED","innerMs":elapsed}),
        };
        writeln!(output, "{response}")?;
        output.flush()?;
    }
    Ok(())
}
