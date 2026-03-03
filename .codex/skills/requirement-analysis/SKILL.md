---
name: requirement-analysis
description: 从文本描述中提取和构建测试需求。当用户提供需要分析和文档化的功能需求、用户故事或规范时使用。
chinese: 需求分析
---

# 需求分析技能 (Requirement Analysis Skill)

当从文本描述中分析需求时：

1. **识别核心功能 (Identify Core Functionality)**
   - 提取描述的主要功能
   - 识别用户目标和目的
   - 注意提到的任何特定用户角色或人物画像

2. **提取验收标准 (Extract Acceptance Criteria)**
   - 寻找明确的成功标准
   - 识别可衡量的结果
   - 注意任何性能或质量要求

3. **定义范围边界 (Define Scope Boundaries)**
   - **范围内 (In Scope)**: 明确提到的功能
   - **范围外 (Out Scope)**: 明确排除或推迟的功能
   - **假设 (Assumptions)**: 隐含的需求或依赖关系

4. **识别约束 (Identify Constraints)**
   - 技术约束（平台、技术）
   - 业务约束（时间表、预算）
   - 用户约束（可访问性、本地化）

5. **识别歧义与提问 (Identify Ambiguities & Questions)**
   - 找出描述不清晰或矛盾的地方
   - 询问缺失的功能细节
   - 确认非功能性需求（性能、安全等）
   - 针对当前测试需求提出具体问题

6. **输出结构 (Output Structure)**
   提供结构化的需求文档：
   ```json
   {
     "requirement": {
       "feature": "功能名称",
       "objectives": ["目标1", "目标2"],
       "user_stories": ["作为... 我想要... 以便..."],
       "scope": {
         "in_scope": ["包含的功能"],
         "out_scope": ["排除的功能"]
       },
       "acceptance_criteria": ["验收标准1", "验收标准2"],
       "constraints": ["约束1"],
       "dependencies": ["依赖1"],
       "questions": [
         {
           "question": "关于...具体应该发生什么...",
           "context": "需求提到了X但没有提到Y",
           "importance": "high"
         }
       ]
     }
   }
   ```

**最佳实践:**
- 使用 5W1H 方法 (Who, What, Where, When, Why, How)
- 关注用户需求和业务价值
- 识别功能性和非功能性需求
- 突出显示任何含糊不清或缺失的信息
