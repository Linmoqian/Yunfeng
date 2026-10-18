//! 固定工作流的真实文件统计夹具，无模型、训练或生产实验入口。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use serde_json::{json, Value};
use std::path::Path;
use yunfeng_research_kernel::{files, Result};

pub fn run(root: &Path) -> Result<Value> {
    let config: Value =
        serde_json::from_str(&files::read_text(root, ".lin/experiments/config.json")?)?;
    let stage = config["stage"].as_str().ok_or("缺少实验阶段")?;
    if !["baseline", "optimize"].contains(&stage) {
        return Err("无效夹具阶段".into());
    }
    let samples: Vec<Value> = serde_json::from_str(&files::read_text(root, "samples.json")?)?;
    let (mut count, mut sum) = (0u64, 0u64);
    for sample in samples {
        if stage == "baseline" || sample["keep"] == true {
            count += 1;
            sum += sample["value"].as_u64().ok_or("夹具需要非负整数")?;
        }
    }
    if count == 0 {
        return Err("实验没有样本".into());
    }
    let report = json!({"count":count,"sum":sum,"mean":sum as f64/count as f64,"completed":1});
    let path = format!(".lin/experiments/{stage}.json");
    files::write_text(root, &path, &report.to_string())?;
    if files::evaluate(root, &json!({"kind":"file_exists","path":path}))?["passed"] != true {
        return Err("实验产物未落盘".into());
    }
    Ok(report)
}
