# T06 日历样例说明

- `calendar-synthetic.json`：人工构造的成功 envelope，事件名称明确标注人工样例，覆盖不排序输入、全天、UTC/带时区时间与地点。没有来自用户真实日历的内容。
- `calendar-error-recorded.json`：2026-10-14 使用 `lark-cli --profile codex calendar +agenda --as user`，上海时区当天范围得到的真实 missing_scope 输出；删除升级通知和授权引导文本，保留原错误类型及缺少的 scope。
- `calendar-real-redacted.json`：2026-10-14 在个人授权成功后录制的真实成功响应，查询范围为 `2026-10-14T00:00:00+08:00` 至 `2026-10-15T00:00:00+08:00`，CLI 版本 1.0.96，codex profile、user 身份，共 4 条日程。保留信封、原顺序、原起止时间和时区；标题替换为编号，移除 ID、描述、参会人/组织者、会议链接及其他不参与转换的字段。4 条均无地点，也没有全天日程；这些分支由人工样例验证。
- 真实失败记录与人工样例用于补充边界，不能冒充真实成功输出。测试固定录制当天日期，不随执行日期漂移；两条同时间日程必须保留。

CLI 1.0.96 的成功数据为 `ok: true, identity: user, data: []`；agenda 输出带时区的 datetime，全天 end_time.date 为最后包含的日期。转换边界依据官方 v1.0.96 `shortcuts/calendar/calendar_agenda.go`，人工用例与实际读取分开记录。
