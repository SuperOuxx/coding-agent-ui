---
name: equivalence-partitioning
description: 将输入划分为等价类，以在保持覆盖率的同时减少测试用例。在优化测试套件或处理大型输入域时使用。
chinese: 等价类划分
---

# 等价类划分技能 (Equivalence Partitioning Skill)

等价类划分 (EP) 是一种黑盒测试技术，它将输入数据划分为预期处理方式相似的组（分区），允许你从每个分区测试一个值，而不是所有可能的值。

## 核心概念

如果等价类中的一个测试用例检测到缺陷，则该类中的所有其他测试用例很可能检测到相同的缺陷。反之，如果一个测试用例通过，该类中的所有其他测试用例也应该通过。

## 何时使用
- 大型输入域（可能的值太多而无法全部测试）
- 数字范围
- 字符串格式和模式
- 这是一个有效/无效值的集合
- 菜单选择和下拉选项
- 日期范围和时间段

## 分区类型

### 1. 有效等价类划分 (Valid Equivalence Partitions)
系统应该接受的值。

**示例**: 年龄输入 (1-120)
```json
{
  "valid_partitions": [
    {
      "name": "valid_adult_age",
      "range": "[18, 64]",
      "representative_value": 30,
      "description": "Working age adults"
    },
    {
      "name": "valid_senior_age",
      "range": "[65, 120]",
      "representative_value": 70,
      "description": "Senior citizens"
    }
  ]
}
```

### 2. 无效等价类划分 (Invalid Equivalence Partitions)
系统应该拒绝的值。

**示例**: 年龄输入 (1-120)
```json
{
  "invalid_partitions": [
    {
      "name": "below_minimum",
      "values": "< 1",
      "representative_value": 0,
      "expected_error": "Age must be positive"
    },
    {
      "name": "above_maximum",
      "values": "> 120",
      "representative_value": 121,
      "expected_error": "Invalid age"
    },
    {
      "name": "non_numeric",
      "values": "letters, symbols",
      "representative_value": "abc",
      "expected_error": "Age must be a number"
    }
  ]
}
```

## 划分指南

### 按数字范围 (By Numeric Range)
**示例**: 薪资范围 ($20,000 - $100,000)
```
Valid partitions:
  - $20,000 (minimum)
  - $50,000 (mid-range)
  - $100,000 (maximum)

Invalid partitions:
  - Below $20,000
  - Above $100,000
  - Negative values
  - Non-numeric
```

### 按字符串格式 (By String Format)
**示例**: 电子邮件地址
```
Valid partitions:
  - Standard format: user@domain.com
  - With dots: first.last@domain.com
  - With numbers: user123@domain.com
  - Subdomain: user@mail.domain.com

Invalid partitions:
  - Missing @
  - Missing domain
  - Special characters
  - Empty string
  - Spaces in email
```

### 按集合成员 (By Set Membership)
**示例**: 性别选择
```
Valid partitions:
  - Male
  - Female
  - Other
  - Prefer not to say

Invalid partitions:
  - Any other value
```

### 按数据类型 (By Data Type)
**示例**: 电话号码
```
Valid partition: Digits only, 10 digits
Invalid partitions:
  - Letters
  - Special characters
  - Too short (< 10 digits)
  - Too long (> 10 digits)
  - Empty/null
```

## 测试用例选择策略

### 策略 1: 每个分区一个值
测试每个分区（有效和无效）的一个代表值。

**示例**: 用户名 (4-16 个字母数字)
```json
{
  "test_cases": [
    {"partition": "valid_min_length", "value": "abcd", "expected": "pass"},
    {"partition": "valid_mid_length", "value": "abc123", "expected": "pass"},
    {"partition": "valid_max_length", "value": "abcd1234567890", "expected": "pass"},
    {"partition": "invalid_too_short", "value": "abc", "expected": "fail"},
    {"partition": "invalid_too_long", "value": "abcd12345678901", "expected": "fail"},
    {"partition": "invalid_special_chars", "value": "abc@123", "expected": "fail"},
    {"partition": "invalid_empty", "value": "", "expected": "fail"}
  ]
}
```

## 结合边界值分析

**最佳实践**: 结合使用等价类划分和边界值分析，以获得全面的覆盖率。

**示例**: 测试分数 (0-100)

| 分区类型 | 分区 | 测试值 |
|---------------|-----------|-------------|
| Valid | [0, 100] | 0, 1, 50, 99, 100 |
| Invalid | < 0 | -1 |
| Invalid | > 100 | 101 |
| Invalid | Non-numeric | "abc" |

## 输出格式

当应用等价类划分时：

```json
{
  "variable": "username",
  "specifications": "4-16 alphanumeric characters",
  "equivalence_classes": [
    {
      "class_id": "EP001",
      "type": "valid",
      "description": "Valid minimum length",
      "values": "4 characters",
      "test_value": "abcd"
    },
    {
      "class_id": "EP002",
      "type": "valid",
      "description": "Valid nominal length",
      "values": "8-10 characters",
      "test_value": "abc12345"
    },
    {
      "class_id": "EP003",
      "type": "valid",
      "description": "Valid maximum length",
      "values": "16 characters",
      "test_value": "abcd1234567890"
    },
    {
      "class_id": "EP004",
      "type": "invalid",
      "description": "Below minimum length",
      "values": "< 4 characters",
      "test_value": "abc",
      "expected_error": "Username must be at least 4 characters"
    },
    {
      "class_id": "EP005",
      "type": "invalid",
      "description": "Above maximum length",
      "values": "> 16 characters",
      "test_value": "abcd12345678901",
      "expected_error": "Username must not exceed 16 characters"
    },
    {
      "class_id": "EP006",
      "type": "invalid",
      "description": "Special characters",
      "values": "Contains special chars",
      "test_value": "abc@123",
      "expected_error": "Username must be alphanumeric only"
    }
  ],
  "test_cases": [
    {"id": "TC001", "class": "EP001", "value": "abcd", "expected": "valid"},
    {"id": "TC002", "class": "EP002", "value": "abc12345", "expected": "valid"},
    {"id": "TC003", "class": "EP003", "value": "abcd1234567890", "expected": "valid"},
    {"id": "TC004", "class": "EP004", "value": "abc", "expected": "invalid"},
    {"id": "TC005", "class": "EP005", "value": "abcd12345678901", "expected": "invalid"},
    {"id": "TC006", "class": "EP006", "value": "abc@123", "expected": "invalid"}
  ]
}
```

## 最佳实践

1. **DO ✅:**
   - 识别有效和无效分区
   - 考虑所有输入条件和约束
   - 选择每个分区的典型代表值
   - 记录每个分区背后的理由
   - 结合边界值分析进行稳健测试
   - 与利益相关者审查分区以确保完整性

2. **DON'T ❌:**
   - 创建重叠的分区
   - 跳过无效分区（错误情况很重要！）
   - 忘记隐式边界或约束
   - 每个分区只使用一个测试用例而不考虑边界
   - 忽略不适合分区的边缘情况

## 高级技术

### 输出等价类划分
测试不同的输出范围，而不仅仅是输入。

**示例**: 成绩计算
```
Output partitions:
  - A: 90-100
  - B: 80-89
  - C: 70-79
  - D: 60-69
  - F: 0-59
```

### 依赖分区
当一个输入的有效分区取决于另一个输入时。

**示例**: 国家和邮政编码
```
Country: USA → Postal code: 5 digits or ZIP+4
Country: Canada → Postal code: A1A 1A1 format
Country: UK → Postal code: Various UK formats
```
