//! 研究工具的增量文稿契约；旧论文快照无需迁移即可读取。
//! Created on 2026-10-14
//! @author: https://github.com/Linmoqian
use serde_json::{Map, Value};

fn text(value: Option<&Value>, limit: usize) -> bool {
    value
        .and_then(Value::as_str)
        .is_some_and(|v| v.len() <= limit && !v.contains('\0'))
}
fn document(state: &Map<String, Value>) -> bool {
    state.len() == 2 && name(state.get("name")) && text(state.get("body"), 64 * 1024)
}
fn name(value: Option<&Value>) -> bool {
    text(value, 800)
        && value
            .and_then(Value::as_str)
            .is_some_and(|value| value.chars().count() <= 200)
}
pub fn valid(state: &Map<String, Value>) -> bool {
    if !state.keys().all(|key| {
        [
            "name",
            "body",
            "analysis",
            "literature",
            "design",
            "references",
            "dataFiles",
        ]
        .contains(&key.as_str())
    }) || !name(state.get("name"))
        || !text(state.get("body"), 64 * 1024)
    {
        return false;
    }
    for tool in ["analysis", "literature", "design"] {
        if let Some(value) = state.get(tool) {
            if !value.as_object().is_some_and(document) {
                return false;
            }
        }
    }
    if let Some(value) = state.get("references") {
        if !value
            .as_array()
            .is_some_and(|items| items.len() <= 200 && items.iter().all(reference))
        {
            return false;
        }
    }
    if let Some(value) = state.get("dataFiles") {
        if !value
            .as_array()
            .is_some_and(|items| items.len() <= 20 && items.iter().all(data_file))
        {
            return false;
        }
    }
    serde_json::to_vec(state).is_ok_and(|bytes| bytes.len() <= 4 * 1024 * 1024)
}
fn reference(value: &Value) -> bool {
    value.as_object().is_some_and(|item| {
        (5..=7).contains(&item.len())
            && item.keys().all(|key| {
                [
                    "id",
                    "title",
                    "citation",
                    "url",
                    "notes",
                    "text",
                    "pdfAssetId",
                ]
                .contains(&key.as_str())
            })
            && text(item.get("id"), 64)
            && text(item.get("title"), 800)
            && text(item.get("citation"), 4096)
            && text(item.get("notes"), 64 * 1024)
            && item.get("url").and_then(Value::as_str).is_some_and(|url| {
                url.len() <= 2048
                    && (url.is_empty()
                        || url::Url::parse(url)
                            .is_ok_and(|parsed| ["https", "http"].contains(&parsed.scheme())))
            })
            && item.get("text").is_none_or(|v| text(Some(v), 64 * 1024))
            && item.get("pdfAssetId").is_none_or(|v| {
                v.as_str()
                    .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
            })
    })
}
fn data_file(value: &Value) -> bool {
    value.as_object().is_some_and(|item| {
        item.len() == 3
            && text(item.get("id"), 64)
            && text(item.get("name"), 800)
            && text(item.get("content"), 64 * 1024)
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn old_and_four_tool_documents_are_valid() {
        assert!(valid(
            json!({"name":"旧文稿", "body":"正文"}).as_object().unwrap()
        ));
        assert!(valid(json!({"name":"论文", "body":"正文", "analysis":{"name":"分析", "body":"数据"}, "design":{"name":"方案", "body":"重复"}, "literature":{"name":"文献", "body":"证据"}, "references":[], "dataFiles":[]}).as_object().unwrap()));
    }
    #[test]
    fn reject_unsafe_links_and_oversized_sources() {
        assert!(!valid(json!({"name":"", "body":"", "references":[{"id":"a", "title":"文献", "citation":"", "url":"javascript:alert(1)", "notes":""}]}).as_object().unwrap()));
        assert!(!valid(json!({"name":"", "body":"", "dataFiles":[{"id":"a", "name":"a.csv", "content":"x".repeat(65537)}]}).as_object().unwrap()));
    }
    #[test]
    fn all_documents_and_sources_survive_database_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.sqlite3");
        let state = serde_json::json!({"name":"旧论文", "body":"旧正文", "analysis":{"name":"分析", "body":"结果"}, "literature":{"name":"文献", "body":"证据"}, "design":{"name":"方案", "body":"重复"}, "references":[{"id":"ref", "title":"文献", "citation":"出处", "url":"https://example.org", "notes":"证据", "text":"全文"}], "dataFiles":[{"id":"data", "name":"数据.csv", "content":"x,y\n1,2"}]});
        let mut store = super::super::model::Store::persistent(path.clone());
        let snapshot = store
            .patch("writing", state.as_object().unwrap().clone())
            .unwrap();
        drop(store);
        let mut reopened = super::super::model::Store::persistent(path);
        let recovered = reopened.get("writing").unwrap();
        assert_eq!(snapshot.state, recovered.state);
        assert_eq!(snapshot.revision, recovered.revision);
        assert!(reopened
            .patch(
                "writing",
                serde_json::json!({"design":{"name":"错误", "body":true}})
                    .as_object()
                    .unwrap()
                    .clone()
            )
            .is_err());
        assert_eq!(reopened.get("writing").unwrap().state, recovered.state);
    }
}
