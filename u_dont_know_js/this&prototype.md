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