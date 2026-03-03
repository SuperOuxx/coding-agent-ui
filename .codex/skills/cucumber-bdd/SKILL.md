---
name: cucumber-bdd
description: 将测试用例转换为 Gherkin 语法以进行 BDD 测试。用于创建可执行的测试规范，弥合需求与自动化测试之间的差距。
chinese: BDD测试
---

# Cucumber/BDD 技能 (Cucumber/BDD Skill)

行为驱动开发 (BDD) 使用 Gherkin 语法弥合业务需求与自动化测试之间的差距。

## 何时使用
- 将测试用例转换为可执行规范
- 创建作为测试的活文档
- 与非技术利益相关者协作
- 使用 Cucumber/SpecFlow 构建自动化测试框架
- 确保测试反映业务需求

## Gherkin 语法结构

### Feature
从用户角度描述正在测试的功能。

```gherkin
Feature: User login
  As a registered user
  I want to login with my credentials
  So that I can access my personalized content
```

### Scenario
具体的测试用例或示例。

```gherkin
Scenario: Successful login with valid credentials
  Given the user is on the login page
  When the user enters username "testuser" and password "Password123!"
  And the user clicks the login button
  Then the user should be redirected to the dashboard
  And a welcome message should be displayed
```

### Background
定义在每个场景之前运行的步骤。

```gherkin
Background:
  Given the application is open
  And the database is connected
```

### Scenario Outline
使用 Examples 表的数据驱动测试。

```gherkin
Scenario Outline: Invalid login attempts
  Given the user is on the login page
  When the user enters username "<username>" and password "<password>"
  And the user clicks the login button
  Then an error message "<error>" should be displayed

  Examples:
    | username | password   | error                  |
    | invalid  | wrong      | Invalid credentials    |
    |          | password   | Username is required   |
    | testuser |            | Password is required   |
    | testuser | wrong      | Invalid credentials    |
```

## Gherkin 关键字

| 关键字 | 目的 | 用法 |
|---------|---------|-------|
| **Feature** | 高层描述 | 特性文件的开始 |
| **Scenario** | 具体测试用例 | 具体示例 |
| **Given** | 前置条件 | 初始上下文 |
| **When** | 动作 | 用户交互 |
| **Then** | 结果 | 预期结果 |
| **And** | 附加步骤 | 多个 Given/When/Then |
| **But** | 对比 | 替代结果 |
| **Background** | 共享上下文 | 在每个场景前运行 |
| **Scenario Outline** | 模板 | 数据驱动场景 |
| **Examples** | 数据表 | 输入组合 |

## 编写优秀的 Gherkin

### 1. 使用业务语言
❌ 坏: "点击 ID 为 #login-button 的元素"
✅ 好: "点击登录按钮"

### 2. 保持场景聚焦
❌ 坏: 测试所有内容的 20 步场景
✅ 好: 测试一个行为的 3-5 步场景

### 3. 使步骤声明式
❌ 坏: "点击按钮，等待 2 秒，检查 URL 包含 /home，验证文本 'Welcome'"
✅ 好: "用户被重定向到主页"

### 4. 使用数据场景大纲
❌ 坏: 编写 5 个类似的场景
✅ 好: 一个带有 Examples 表的 Scenario Outline

## 步骤定义模式

### Given 步骤 (状态)
```javascript
// Single step
Given('the user is on the login page', async function() {
  await this.page.goto('https://example.com/login');
});

// With parameters
Given('a user exists with username {string}', async function(username) {
  await this.database.createUser({ username });
});

// Table data
Given('the following products exist:', async function(dataTable) {
  const products = dataTable.hashes();
  for (const product of products) {
    await this.database.createProduct(product);
  }
});
```

### When 步骤 (动作)
```javascript
// Simple action
When('the user clicks the {string} button', async function(buttonText) {
  await this.page.click(`button:text-is('${buttonText}')`);
});

// Multiple parameters
When('the user enters username {string} and password {string}',
  async function(username, password) {
    await this.page.fill('#username', username);
    await this.page.fill('#password', password);
  }
);
```

### Then 步骤 (结果)
```javascript
// Verification
Then('a welcome message should be displayed', async function() {
  const message = await this.page.textContent('.welcome-message');
  assert.isNotEmpty(message);
});

// With parameters
Then('the error message {string} should be displayed', async function(expectedMsg) {
  const actualMsg = await this.page.textContent('.error');
  assert.equal(actualMsg, expectedMsg);
});
```

## 完整示例

```gherkin
Feature: User Authentication

  Background:
    Given the application is running
    And the test database is initialized

  Scenario: Successful registration
    Given the user is on the registration page
    When the user enters email "test@example.com" and password "SecurePass123!"
    And the user confirms password "SecurePass123!"
    And the user clicks the register button
    Then the account should be created
    And a confirmation email should be sent
    And the user should be redirected to the welcome page

  Scenario: Registration with weak password
    Given the user is on the registration page
    When the user enters email "test@example.com" and password "weak"
    And the user clicks the register button
    Then the registration should fail
    And an error "Password must be at least 8 characters" should be displayed

  Scenario Outline: Registration with invalid email formats
    Given the user is on the registration page
    When the user enters email "<email>" and password "SecurePass123!"
    And the user clicks the register button
    Then an error "Invalid email format" should be displayed

    Examples:
      | email                |
      | invalid              |
      | @example.com         |
      | user@               |
      | user @example.com    |
```

## 最佳实践

### DO ✅
- 从用户角度编写场景
- 一致地使用 Given-When-Then 结构
- 保持场景简短（3-8 步）
- 使场景相互独立
- 使用有意义的、以业务为中心的名称
- 在 Scenario Outlines 中包含示例
- 编写声明式步骤（做什么，而不是怎么做）
- 保持背景步骤最小化

### DON'T ❌
- 不要包含实现细节
- 不要编写依赖执行顺序的场景
- 不要在在一个场景中混合多种行为
- 不要使用技术术语
- 不要编写过长的场景
- 不要重复类似的场景（使用 Scenario Outline）
- 不要在步骤中直接包含测试数据（使用表格）

## 与 Playwright 集成

```gherkin
Feature: E2E Testing with Playwright

  Scenario: Complete purchase flow
    Given the user is on the home page
    When the user searches for "laptop"
    And the user clicks the first product
    And the user adds the product to cart
    And the user proceeds to checkout
    And the user enters shipping information
    And the user selects "Credit Card" payment
    And the user confirms the order
    Then the order should be placed successfully
    And a confirmation email should be sent
```

对应的步骤定义：
```javascript
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

Given('the user is on the home page', async function() {
  await this.page.goto('https://shop.example.com');
});

When('the user searches for {string}', async function(searchTerm) {
  await this.page.fill('[name="search"]', searchTerm);
  await this.page.click('[type="submit"]');
});

Then('the order should be placed successfully', async function() {
  const confirmation = await this.page.textContent('.order-confirmation');
  expect(confirmation).toContain('Thank you for your order');
});
```

## 输出格式

当将测试用例转换为 Gherkin 时：

```gherkin
Feature: [Feature name from test case]

  [Background if common preconditions exist]

  Scenario: [Test case title]
    Given [Precondition steps]
    When [Action steps]
    Then [Verification steps]
    And [Additional steps as needed]

  Scenario Outline: [For data-driven tests]
    Given [Precondition]
    When [Action with <parameter>]
    Then [Expected <result>]

    Examples:
      | parameter | result |
      | value1    | output1|
      | value2    | output2|
```
