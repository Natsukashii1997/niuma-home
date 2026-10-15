import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantListReader } from "../src/modules/assistants/assistant-list.js";

test("切换助手后的较早回读迟到，不能覆盖较新模型设置显示",async()=>{
  const pending=[],published=[];
  const reload=assistantListReader(()=>new Promise(resolve=>pending.push(resolve)),rows=>published.push(rows));
  const first=reload(),second=reload();
  const latest=[{id:1,model:"a",effort:"high"},{id:2,model:"b",effort:"high"}];
  pending[1](latest);await second;
  pending[0]([{id:1,model:"a",effort:"high"},{id:2,model:null,effort:null}]);await first;
  assert.deepEqual(published,[latest]);
});
