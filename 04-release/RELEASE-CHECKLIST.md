# GitHub 开源前检查清单

- [ ] 删除或确认没有真实 `sessions/`、`archived_sessions/`。
- [ ] 删除或确认没有 `*.sqlite`、`*.sqlite-wal`、`*.sqlite-shm`。
- [ ] 删除或确认没有 `auth.json`、`.env`、`installation_id`。
- [ ] 删除或确认没有完整备份目录。
- [ ] 检查日志和示例中的用户名、绝对路径、项目路径、会话 ID。
- [ ] 使用脱敏的测试夹具验证导出、导入、冲突、回滚。
- [ ] 在不同 Codex 版本上先执行 `--dry-run` 或隔离目录测试。
- [ ] README 中注明 Codex 内部 schema 可能变化。
- [ ] 不把 Codex++ 二进制、安装包或第三方私有配置提交到仓库。
- [ ] 为 GitHub Actions 增加 Node.js 语法检查和 PowerShell 静态检查。
