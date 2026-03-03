---
name: boundary-value-analysis
description: 应用边界值分析来识别边缘情况。在测试具有数字范围、字符串长度、数组大小或任何具有定义限制的域的输入时使用。
chinese: 边界分析
---

# 边界值分析技能 (Boundary Value Analysis Skill)

边界值分析 (BVA) 是一种黑盒测试技术，专注于测试输入域的边界，因为错误经常发生在这些边缘。

## 何时使用
- 测试具有最小/最大限制的数字输入
- 验证字符串长度约束
- 检查数组/集合大小限制
- 测试日期/时间边界
- 文件大小或上传限制
- 任何具有明确边界的域

## 核心概念

错误最有可能发生在：
- **最小边界 (Minimum boundaries)**: 有效范围的下边缘
- **最大边界 (Maximum boundaries)**: 有效范围的上边缘
- **刚好低于边界 (Just below boundaries)**: 低于最小值的第一个无效值
- **刚好高于边界 (Just above boundaries)**: 高于最大值的第一个无效值

## 测试值选择

对于范围 **[min, max]**，测试这些值：
```
min - 1  (低于最小值 - 应该失败)
min      (处于最小值 - 应该通过)
min + 1  (刚好高于最小值 - 应该通过)
max - 1  (刚好低于最大值 - 应该通过)
max      (处于最大值 - 应该通过)
max + 1  (高于最大值 - 应该失败)
```

## 边界类型

### 1. 数字边界 (Numeric Boundaries)
**示例**: 年龄输入 (18-60 岁)
```json
{
  "test_values": [
    {"value": 17, "type": "below_min", "expected": "error"},
    {"value": 18, "type": "min_boundary", "expected": "valid"},
    {"value": 19, "type": "above_min", "expected": "valid"},
    {"value": 59, "type": "below_max", "expected": "valid"},
    {"value": 60, "type": "max_boundary", "expected": "valid"},
    {"value": 61, "type": "above_max", "expected": "error"}
  ]
}
```

### 2. 字符串长度边界 (String Length Boundaries)
**示例**: 用户名 (4-16 个字符)
```json
{
  "test_values": [
    {"value": "abc", "length": 3, "type": "below_min", "expected": "error"},
    {"value": "abcd", "length": 4, "type": "min_boundary", "expected": "valid"},
    {"value": "abcde", "length": 5, "type": "nominal", "expected": "valid"},
    {"value": "abcdefghijklmnop", "length": 16, "type": "max_boundary", "expected": "valid"},
    {"value": "abcdefghijklmnopq", "length": 17, "type": "above_max", "expected": "error"}
  ]
}
```

### 3. 数组/集合边界 (Array/Collection Boundaries)
**示例**: 购物车 (1-10 个商品)
```json
{
  "test_values": [
    {"value": 0, "type": "empty", "expected": "error"},
    {"value": 1, "type": "min_boundary", "expected": "valid"},
    {"value": 5, "type": "nominal", "expected": "valid"},
    {"value": 10, "type": "max_boundary", "expected": "valid"},
    {"value": 11, "type": "above_max", "expected": "error"}
  ]
}
```

### 4. 日期/时间边界 (Date/Time Boundaries)
**示例**: 活动注册 (2025-01-01 到 2025-12-31)
```json
{
  "test_values": [
    {"value": "2024-12-31", "type": "below_min", "expected": "error"},
    {"value": "2025-01-01", "type": "min_boundary", "expected": "valid"},
    {"value": "2025-07-01", "type": "nominal", "expected": "valid"},
    {"value": "2025-12-31", "type": "max_boundary", "expected": "valid"},
    {"value": "2026-01-01", "type": "above_max", "expected": "error"}
  ]
}
```

## 特殊边界情况

### 单侧边界 (Single-Sided Boundaries)
**示例**: 密码必须至少 8 个字符
```
Test: 7, 8, 9 characters
```

### 复合边界 (Compound Boundaries)
**示例**: 1 ≤ x ≤ 100 AND 10 ≤ y ≤ 50
```
Test combinations:
- (x=1, y=10)  - min/min
- (x=100, y=50) - max/max
- (x=1, y=50)  - min/max
- (x=100, y=10) - max/min
```

### 常见特殊值
- **Zero**: 0, -0, +0
- **One**: 1, -1
- **Null/Empty**: null, undefined, ""
- **Max values**: MAX_INT, MAX_SAFE_INTEGER
- **Floating point precision**: 0.1 + 0.2 ≠ 0.3

## 应用流程

1. **识别所有输入变量**及其边界
2. 从需求中**提取边界规范**
3. **确定边界值**
4. **创建测试用例**针对每个边界值
5. **验证预期行为**在每个边界处

## 最佳实践

- 不仅测试边界处，还要测试刚超出边界的值
- 考虑隐式边界（数组索引，数据库限制）
- 测试单侧和复合边界
- 包含无效的边界值
- 记录关于边界定义的假设
- 结合等价类划分以获得全面覆盖
