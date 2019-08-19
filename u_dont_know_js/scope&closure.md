# 作用域&闭包

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
    console.log(a, b);
}

foo("var b = 3;", 1);	//1, 3
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

虽然 `eval` 和 `with`  能够为我们带来一些使用上的便利（如动态化和减少代码冗余），但它们存在欺骗词法作用域的场景，在这些场景下，轻则使程序性能降低，重则影响业务功能，所以在平时还是要慎重使用。