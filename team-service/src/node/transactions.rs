//! 节点导入的存储事务边界；业务记录与事件日志整批提交或回滚。
//! Created on 2026-10-17
//! @author: https://github.com/Linmoqian
use crate::{
    model::{Error, Result},
    Store,
};

impl Store {
    /// 在同一数据库事务中提交业务记录与节点事件；失败整批回滚。
    pub(crate) fn atomic<T>(
        &mut self,
        operation: impl FnOnce(&mut Self) -> Result<T>,
    ) -> Result<T> {
        self.db
            .execute_batch("SAVEPOINT team_node;")
            .map_err(Error::storage)?;
        match operation(self) {
            Ok(value) => {
                self.db
                    .execute_batch("RELEASE team_node;")
                    .map_err(Error::storage)?;
                Ok(value)
            }
            Err(error) => {
                self.db
                    .execute_batch("ROLLBACK TO team_node; RELEASE team_node;")
                    .map_err(Error::storage)?;
                Err(error)
            }
        }
    }
}
