//! 借用检查点字段序列化，将另表保存的节点替换为空列表，避免复制目标树。
//! Created on 2026-10-18
//! @author: https://github.com/Linmoqian
use serde::{ser::SerializeMap, Serialize, Serializer};
use serde_json::Value;
pub(crate) struct Checkpoint<'a>(pub &'a Value, pub u8);
impl Serialize for Checkpoint<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let Some(object) = self.0.as_object() else {
            return self.0.serialize(serializer);
        };
        let mut map = serializer.serialize_map(Some(object.len()))?;
        for (key, value) in object {
            match (self.1, key.as_str()) {
                (0, "autonomy") => map.serialize_entry(key, &Checkpoint(value, 1))?,
                (1, "decision") => map.serialize_entry(key, &Checkpoint(value, 2))?,
                (2, "nodes") => map.serialize_entry(key, &[] as &[Value])?,
                _ => map.serialize_entry(key, value)?,
            }
        }
        map.end()
    }
}
