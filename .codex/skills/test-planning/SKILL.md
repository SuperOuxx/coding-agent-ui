---
name: test-planning
description: 创建全面的测试计划和策略。在开始新的测试项目、定义测试方法或确定需要测试什么以及如何测试时使用。
chinese: 测试计划
---

# 测试计划技能 (Test Planning Skill)

当创建测试计划时：

1. **分析测试范围 (Analyze Test Scope)**
   - 审查需求和验收标准
   - 识别需要测试的内容
   - 确定哪些在范围之外

2. **选择测试类型 (Select Test Types)**
   根据项目，包含相关类型：
   - **Functional Testing**: 验证功能是否符合规范
   - **Performance Testing**: 负载、压力、可扩展性
   - **Security Testing**: 认证、授权、漏洞
   - **Compatibility Testing**: 浏览器、设备、操作系统版本
   - **Usability Testing**: 用户体验、可访问性
   - **Integration Testing**: API、第三方服务
   - **Regression Testing**: 防止现有功能中出现新 bug

3. **定义测试策略 (Define Test Strategy)**
   - 测试方法（手动、自动或混合）
   - 测试级别（单元、集成、系统、验收）
   - 基于风险的测试优先级
   - 每个阶段的进入和退出标准

4. **指定测试环境 (Specify Test Environment)**
   - 要测试的浏览器和版本
   - 设备和屏幕尺寸
   - 操作系统
   - 测试数据需求
   - 数据库设置
   - 测试服务器和预发布环境

5. **创建测试时间表 (Create Test Schedule)**
   分解为阶段：
   - 测试计划和准备
   - 测试用例开发
   - 测试环境设置
   - 测试执行
   - Bug 诊断和修复
   - 回归测试
   - 测试结束和报告

6. **风险评估 (Risk Assessment)**
   - 识别高风险区域
   - 计划缓解策略
   - 定义应急计划

7. **输出结构 (Output Structure)**
   ```json
   {
     "test_plan": {
       "strategy": "Overall testing approach",
       "test_types": [
         {
           "type": "Functional Testing",
           "priority": "P0",
           "scope": "Core features",
           "approach": "Automated"
         }
       ],
       "environment": {
         "browsers": ["Chrome", "Firefox", "Safari"],
         "devices": ["Desktop", "Mobile"],
         "test_data": "Description of data needs"
       },
       "schedule": [
         {
           "phase": "Test Planning",
           "duration": "2 days",
           "tasks": ["task1", "task2"]
         }
       ],
       "risks": [
         {
           "risk": "Risk description",
           "impact": "High/Medium/Low",
           "mitigation": "Mitigation plan"
         }
       ]
     }
   }
   ```

**最佳实践:**
- 根据风险和业务影响对测试进行优先级排序
- 平衡自动化和手动测试工作
- 考虑早期测试（左移方法）
- 计划测试维护和更新
