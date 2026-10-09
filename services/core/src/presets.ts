export const llmPresets = [
  {name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',model:'deepseek-flash',source:'https://api-docs.deepseek.com/',contextTokens:4096,outputTokens:1024,vision:null},
  {name:'Kimi / 月之暗面',baseUrl:'https://api.moonshot.cn/v1',model:'kimi-k2.5',source:'https://platform.moonshot.cn/docs/api/chat',contextTokens:4096,outputTokens:1024,vision:null},
  {name:'阿里云百炼 / 通义千问',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus',source:'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',contextTokens:4096,outputTokens:1024,vision:null},
  {name:'智谱 GLM',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.7',source:'https://docs.bigmodel.cn/api-reference/模型-api/对话补全',contextTokens:4096,outputTokens:1024,vision:null},
  {name:'豆包 / 火山方舟',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',model:'',source:'https://www.volcengine.com/docs/82379/1298454',contextTokens:4096,outputTokens:1024,vision:null},
  {name:'硅基流动',baseUrl:'https://api.siliconflow.cn/v1',model:'deepseek-ai/DeepSeek-V3.2',source:'https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions',contextTokens:4096,outputTokens:1024,vision:null}
];
// Model aliases/availability are service-controlled; users may override every field.
