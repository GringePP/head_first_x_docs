# This&Prototype

## this

`this` 是 JS 世界中的“上下文”，类似于 Android 中的 context，它表示的是当下的环境。这么说可能有些含糊，下面直接看具体例子吧。

```js
function print() {
    console.log(this.name);
}

var o1 = { name: "Bob" };
var o2 = { name: "Jet" };

print.call(o1);		//Bob
print.call(o2);		//Jet
```

这里先不用理会 `call` 函数是什么东西，只需要关注，调用同个函数，传入不同的参数（在这里即是上下文），同时搭配 this 的使用，那么可以让函数产生不同的效果。

### 指向自身？

从字面上理解，很容易把 this 理解为“自身”，虽然在部分情况下是正确的，但是仍然不是 this 的正确解释。

看下以下例子：

```js
function foo() {
    this.count++;
}

foo.count = 0;

for (var i = 0; i < 3; i++) {
    foo();
}

console.log(foo.count);		//0
```

这段代码我们的预想是输出 3，但最终是 0，说明 this 明显不是指向 foo 函数自身。

那么，`this.count` 到底是指向了什么？其实相当于在全局上创建了一个 count 标识符，且其数值最终为 NaN，关于这个问题后面会再作解释。

## this 绑定规则

this 具体绑定到什么对象，需要考虑**函数具体被调用的位置**和 **this 的绑定规则**。

### 默认绑定

非严格模式下，`this` 默认绑定到全局，比如：

```js
function foo() {
    console.log(this.name);
}

var name = "Bob";

foo();		//Bob
```

### 隐式绑定

直接举例说明何为隐式绑定：

```js
function foo() {
    console.log(this.name);
}

var obj = {
    name: "Jet",
    foo: foo
}

obj.foo();		//Jet
```

当函数引用有上下文对象时，会将函数调用中的 this 绑定到该对象，即上述代码中的 `obj`，此时 `this.name` 即为 `obj.name`。

同时，如果存在链式调用，则 this 只会绑定到最后一层上下文对象。

```js
function foo() {
    console.log(this.name);
}

var obj2 = {
    name: "Jet",
    foo: foo
}

var obj1 = {
    name: "Bob",
    obj2: obj2
}

obj1.obj2.foo();		//Jet
```

#### 隐式丢失

上面我们说到，this 具体被绑定到哪个对象上，除了考虑绑定规则外，还需要判断函数被调用的位置。在某些情况下，隐式绑定的规则会失效，我们称之为*隐式丢失*。

