---
name: test-case-design
description: 使用行业标准技术设计详细的测试用例。用于将测试计划转换为可执行的测试用例，通过边界分析和等价类划分确保全面覆盖。
chinese: 测试用例设计
---

# 测试用例设计技能 (Test Case Design Skill)

当设计测试用例时：

1. **应用测试设计技术**

   **等价类划分 (Equivalence Partitioning):**
   - 将输入数据分为有效和无效分区
   - 从每个分区选择一个代表值
   - 测试有效和无效场景

   **边界值分析 (Boundary Value Analysis):**
   - 在边界处进行测试 (min, min-1, min+1, max, max+1)
   - 测试数组边缘、字符串长度、数字范围
   - 识别差一错误 (off-by-one errors)

   **决策表 (Decision Tables):**
   - 用于具有多个条件的复杂业务逻辑
   - 覆盖所有输入和预期输出的组合
   - 处理基于规则的系统

   **状态转换 (State Transition):**
   - 测试系统状态和有效转换
   - 覆盖所有有效和无效转换
   - 测试进入和退出条件

2. **测试用例结构**
   每个测试用例应包括：
   - **id**: TC001, TC002 等
   - **module**: 系统模块名称
   - **feature**: 系统模块下的功能名称
   - **description**: 清晰的测试用例描述
   - **preconditions**: 测试前所需的状态
   - **priority**: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
   - **steps**: 详细的、循序渐进的步骤说明
   - **expected_result**: 应该发生什么
   - **actual_result**: 实际结果
   - **status**: pass/fail
   - **type**: 功能/界面/性能 等

3. **确保覆盖率**
   - **Positive Testing**: 有效输入，快乐路径
   - **Negative Testing**: 无效输入，错误处理
   - **Boundary Testing**: 边缘情况和限制
   - **Integration Testing**: 组件交互
   - **End-to-End Testing**: 完整的用户工作流

4. **编写清晰的步骤**
   - 具体且可操作
   - 使用简单的语言
   - 包含确切值（不是"输入有效名称" → "输入 'John Doe'"）
   - 按顺序编号每个步骤
   - 每步一个动作
   - 包含验证点

5. **输出格式**
   ```json
   {
     "test_cases": [
       {
         "id": "TC001",
         "module": "认证",
         "feature": "登录",
         "description": "验证用户使用有效凭据登录",
         "preconditions": "用户账号存在",
         "priority": "P0",
         "steps": "1. 导航到登录页面\n2. 输入有效用户名\n3. 输入有效密码\n4. 点击登录按钮",
         "expected_result": "用户被重定向到仪表盘",
         "actual_result": "",
         "status": "Pass",
         "type": "功能"
       }
     ]
   }
   ```

**最佳实践:**
- 每个测试用例应该验证一件事
- 保持测试用例相互独立
- 包含正向和负向场景
- 使用一致的命名约定
- 在可能的情况下使步骤可重用
- 考虑维护和更新
- 将测试用例链接到需求以实现可追溯性
