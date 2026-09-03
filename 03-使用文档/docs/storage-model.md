# Storage Model

## Data flow

```text
Codex turn
  -> sessions/<date>/rollout-*.jsonl
  -> state_5.sqlite.threads
  -> sqlite/codex-dev.db.local_thread_catalog
  -> Desktop sidebar and history filters
```

## Core files

### sessions/*.jsonl

完整会话正文。首条 `session_meta` 通常包含 `id`、`cwd` 和 `model_provider`。

### state_5.sqlite

官方主历史索引。`threads.id` 必须对应 JSONL 会话 ID，`threads.rollout_path` 必须指向目标电脑上的实际文件，`threads.model_provider` 决定 provider 筛选。

### sqlite/codex-dev.db

Codex Desktop 目录缓存。`local_thread_catalog` 用于侧边栏和本地/远程主机目录聚合，不替代会话正文。

### session_index.jsonl

轻量标题和更新时间索引。跨电脑时按会话 ID 合并，不能用源文件整体覆盖目标文件。

### -wal / -shm

SQLite 事务和协调文件。迁移前必须退出 Codex；备份时应与对应数据库一起保存。

## Why all layers matter

只复制 JSONL，Codex 可能没有对应 `threads` 行；只改 SQLite，`rollout_path` 可能仍指向源电脑；只改目录缓存，官方主索引仍会把会话归到旧 provider。

可靠迁移必须同时处理正文、主索引、目录缓存、标题索引和目标路径。
