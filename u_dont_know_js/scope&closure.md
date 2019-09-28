---
title_cn: 作用域&闭包
title_en: scope and closure
---

# 作用域&闭包

## 作用域

### LHS&RHS

在介绍作用域之前，有必要对 LHS 和 RHS 的概念进行解释。

LHS(Left-Hand Side) 是代表赋值操作的左侧，RHS(Right-Hand Side) 代表赋值操作的右侧（或者非左侧）；另外一种更加通俗易懂的说法：LHS 是代表对变量进行赋值，而 RHS 则是对变量进行查询取值。

具体可看下面例子：

```js
var a = 2;	//对于a是LHS
var b = a;	//对于b是LHS，对于a是RHS
```

另外，在非严格模式下进行 LHS 操作，一旦发现被赋值的变量在当前作用域不存在，编译器会自动在全局作用域上将该变量声明出来。

```js
function foo(a) {
    b = a;
}

foo(2);
console.log(b);		//2
```

相当于：

```js
var b;

function foo(a) {
    b = a;
}

foo(2);
console.log(b);		//2
```

但 RHS 不一样，RHS 操作一旦发现要获取的变量在所有嵌套的作用域中都不存在时， 会抛出 `ReferenceError` 错误：

```js
function foo() {
    console.log(b);		//ReferenceError
}

foo();
```

此处，有一个跟 `ReferenceError` 相近的错误类型可以一并解释下，`TypeError` 是指在（嵌套）作用域中能够找到该变量，但对该变量进行了不合理的操作，比如：

```js
function foo(a) {
    b = a;
    b();	//TypeError
}

foo(2);
```

### 遮蔽与欺骗

我们知道，变量的寻找，会从最内部的作用域，一层层地往外寻找，直到最外层作用域（全局作用域）。这个查找的操作，会在找到第一个匹配的标识符时停止，而在多层嵌套的作用域中，如果同时定义同名的标识符，那么内层的标识符会“遮蔽”(shadow)掉外层的。

在遮蔽的基础上，有一些做法能欺骗词法，达到运行时来修改作用域的效果。

#### eval

`eval` 方法能够将其入参视为语句，且动态执行。

```js
var b = 2;

function foo(str) {
    eval(str);
    console.log(b);
}

foo("var b = 3;");	//3
```

#### with

写过 Kotlin 的同学可能对这个关键字更了解一些，`with` 接受一个对象，并创建该对象的一个专有作用域，在改作用域中，`this` 则是指该对象，可用来省略一些重复操作，比如：

```js
var obj = {
    a: 1,
    b: 2,
    c: 3
}

with(obj) {
    a = 4;
    b = 5;
    c = 6;
}

//等同于
obj.a = 4;
obj.b = 5;
obj.c = 6;
```

但是使用 `with` 会存在欺骗词法作用域的情况，请参考下面例子：

```js
var obj1 = {
    a: 1,
    b: 2,
}

var obj2 = {
    a: 3
}

function foo(obj) {
    with(obj) {
        b = 4;
    }
}

foo(obj1);
console.log(obj1.b);	//4

foo(obj2);
console.log(obj2.b);	//undefined

console.log(b);		//4，b已经被泄漏到全局作用域中
```

虽然 `eval` 和 `with`  能够为我们带来一些使用上的便利（如动态化和减少代码冗余），但它们存在欺骗词法作用域的场景，在这些场景下，轻则使程序性能降低，重则影响业务功能甚至引起安全问题（命令注入），所以在平时还是要慎重使用。

### 立即执行函数

我们知道可以通过函数来达到封装的效果，即函数内的变量和对象只在该函数作用域内有效，不会“污染”到上层作用域或顶层作用域。但是，函数声明的同时也可能导致污染，看下面例子：

```js
var a = 1;

function foo() {
    var a = 2;
    console.log(a);
}

foo();		//2
console.log(a);		//1
```

这个时候虽然 `foo` 函数作用域中的变量 a 不会影响到全局中的 a，但是 foo 函数的声明却污染了全局作用域，即产生了 `foo` 这个标识符。

使用立即执行函数可以解决这个问题。立即执行函数，Imediately Invoke Function Expression（IIFE），是函数表达式的一种，基本形式为：`(function foo(){}());`，故以上的问题可以优化为：

```js
var a = 1;

(function foo() {
    var a = 2;
    console.log(a);
})();

console.log(a);
```

IIFE 又存在具名和匿名两种方式：

```js
(function foo() {		//具名
    //...
})();

(function() {		//匿名
    //...
})();
```

它们的作用是一样的，但是具名 IIFE 具有以下几个优点：

* 在调试过程中更方便，调用栈可以显示对应的函数名；
* 引用自身没有障碍，而匿名函数需要使用 `arguement.callee` 来调用自身；
* 一个具有名称的函数往往更具可读性；

## 变量提升

### var

对于使用 `var` 声明的变量，编译器会将该变量的声明操作，提升到该作用域的最顶端。比如：

```js
console.log(a);		//undefined
var a = 10;
```

但要注意跟 LHS 变量提升的不同，LHS 变量提升，是在**非严格模式下**，LHS 操作会为未声明的变量在全局作用域上声明，且这个声明是运行时的，而不是编译阶段完成的：

```js
console.log(a);		//ReferenceError
a = 10;
```

### 提升优先级

不止变量会被提升，函数也会被提升。（函数表达式的声明也属于变量声明的一种）

函数声明提升的优先级高于变量声明提升，即在同个作用域下，若有函数声明和变量声明对同一个标识符进行声明，函数声明是优先考虑的，在这种情况下，变量声明也不会再提升了。

```js
console.log(foo);	//[Function: foo]

var foo = 1;

function foo() {
}

console.log(foo);	//1
```

以上代码编译后相当于：

```js
function foo() {
}

console.log(foo);

foo = 1;		//变量不会再提升了，变成了简单的赋值

console.log(foo);
```

## 闭包

### 基本概念

闭包是一个比较神秘的不好解释的概念，先用几个实际例子来感受下它的存在吧：

```js
/* Example 1 */
function foo() {
    var a = 2;
    
    return function() {
        console.log(a);
    }
}

var baz = foo();
baz();		//2


/* Example 2 */
function foo() {
    var a = 2;
    
    function baz() {
        console.log(a);
    }
    
    bar(baz);
}

function bar(fn) {
    fn();
}

foo();		//2
```

闭包可以使函数在其定义时词法作用域以外的地方被调用，且闭包还能继续访问其定义时词法作用域内的变量和函数。如 Example 1 中，`baz` 可以调用到匿名函数，从而访问到 `a`；Example 2 中，`fn` 可以调用到 `baz` 且访问到 `a`。

### 循环与闭包

```js
for (var i = 0; i < 5; i++) {
    setTimeout(function () {
        console.log(i);
    }, 500);
}
```

按我们一开始的设想，上述代码是想实现每 500ms 打印出 0,1,2,3,4,5，然后程序的最终结果是输出 5 个 5。

原因很简单，虽然 setTimeout 中的回调函数是一个闭包，但是其引用的 i 是位于 for 循环这个作用域，当回调函数被调用时，i 早就变成 5 了，所以才会打印出 5 个 5。

有人可能会说了，那是因为你延迟了 500ms，如果你延迟 0ms，让回调函数立即执行就会被立即执行了，每次打印出来的 i 也是我们想要的了，但事实真的是如此吗？

```js
for (var i = 0; i < 5; i++) {
    setTimeout(function () {
        console.log(i);
    }, 0);
}
```

很遗憾，结果并不如愿，上面的程序还是会打印出 5 个 5，这里涉及到同步代码、异步代码、宏任务、微任务和 EventLoop 的概念，先不在这里展开描述了。

那么，我们要怎么解决这个问题，让程序输出预想的结果呢？

IIFE 可以创建一个封闭的作用域，它可以做到：

```js
for (var i = 0; i < 5; i++) {
    (function () {
        var j = i;
        setTimeout(function () {
        	console.log(j);
    	}, 500);
    })();
}
```

let 关键字声明的变量，可以“挟持”所在的块作用域，所以其也可以实现我们想要的效果：

```js
for (var i = 0; i < 5; i++) {
    let j = i;
    setTimeout(function() {
        console.log(j);
    }, 500);
}

//OR
for (let i = 0; i < 5; i++) {
    setTimeout(function () {
        console.log(j);
    }, 500);
}
```



