# AGENTS.md

## 运行模式
目标模式：自主连续执行，直到主提示词第 14 节验收清单全部 PASS 且阶段 8 审计通过，
输出第 18 节最终交付报告后终止。禁止中途停止等待用户输入；遇阻塞按主提示词第 15 节
规则自行决策并继续。

## 每次会话开始必读（顺序）
1. PROGRESS.md
2. docs/architecture.md
3. docs/feature-matrix.md
4. docs/design-guidelines.md
5. docs/api.md
6. docs/db-schema.md
7. docs/js-source-compat.md
8. docs/EVIDENCE.md
9. docs/BLOCKERS.md
10. docs/DECISIONS.md

## 不可违背的规则
1. 功能对等优先于代码优雅；禁止裁剪任何功能或按钮。
2. 业务逻辑优先从 reference/venera-prime 迁移复用；重写必须记录原因。
3. 任何跨 userId 的数据访问都是 bug，必须服务端校验归属。
4. 不硬编码凭据；不入库 .env、*.db、上传文件、node_modules、.dart_tool、target。
5. reference/ 只读。
6. 无代码 + 测试 + 证据不得标记 DONE；TODO/FIXME 占位视为未完成。
7. 同一问题修复失败 3 次必须换方案并记录 DECISIONS.md。
8. 每阶段结束必须更新 PROGRESS.md 与 EVIDENCE.md，且通过该阶段验证命令。
9. 用户可见 UI 必须三档宽度（375/768/1280）自检通过。
10. 提交前本地必须通过：后端 dart analyze && dart test；
    前端 npm run typecheck && npm run build。

## 常用命令
- 后端：dart analyze && dart test
- 前端：npm run typecheck && npm run build && npm test
- 容器：docker compose up --build  /  docker compose logs -f
- 健康检查：curl -fsS http://localhost:8080/api/health
- 建仓推送：gh repo create venera-prime-server --public --source=. --remote=origin --push
- 镜像拉取验证：docker pull ghcr.io/<owner>/venera-prime-server:latest

## 目录约定
- backend/       Dart 服务端（routes/services/repositories/db）
- frontend/      React + TS + Tailwind
- rust/          Rust 组件（JS 引擎、图像处理等）
- reference/     原项目只读副本
- data/          运行时数据（挂载卷，.gitignore）
- docs/          所有产出文档 + screenshots/
- .zcode/skills/ 设计规范来源

## 阶段推进纪律
- 不得跨阶段推进（阶段 N 验证未通过不得开始 N+1）。
- 阶段 0 的 feature-matrix.md 是全项目验收基准，后续一切以它为准。
- 阶段 8 审计必须基于真实运行容器逐条操作，不得纸上谈兵。
