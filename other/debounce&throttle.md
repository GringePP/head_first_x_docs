# 防抖和节流

## 防抖

防抖，debounce，即防止短时间内产生多个相同动作。如果动作时间间隔小于阈值，则只会执行最后一个动作。

JavaScript 的实现如下：

```js
function debounce(fn, wait) {
    let timer;
    return function() {
        const context = this;
        const args = arguments;
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => { fn.apply(context, args); }, wait);
    }
}
```

但是上面这个程序有一个缺点，比如我们正常点击按钮的时候，动作要延迟 wait 时间后才能被执行，这样的用户体验可能会比较差，特别是在秒杀活动这些对时间十分敏感的功能上。

下面的程序可以让第一次执行时就执行动作，而往后的抖动动作都会被剔除。

```js
function debounce(fn, wait) {
    let allow = true;
    return function () {
        const context = this;
        const args = arguments;

        if (allow) {
            fn.apply(context, args);
            allow = false;
        } else {
            clearTimeout(timer);
        }
        setTimeout(() => { allow = true; }, wait);
    }
}
```

在“不允许”的情况下再次发出动作，则会一致将 `allow=true` 的操作往后延。

## 节流

节流，throttle，即在一定时间段内只允许有一个动作被执行，其余动作被剔除。

JavaScript 的实现如下：

```js
function throttle(fn, wait) {
    let valveIsOpen = true;
    return function() {
        const context = this;
        const args = arguments;
        if (valveIsOpen) {
            fn.apply(context, args);
            valveIsOpen = false;
            setTimeout(() => { valveIsOpen = true; }, wait);
        }
    }
}
```

这里形象地用一个 `valveIsOpen` 的变量来表示“阀门”是否已打开，如果打开则动作可以执行，且执行后需要把阀门关上，过上特定的时间后才能再次把阀门打开。

当然，也可以直接用 timer 来代替：

```js
function throttle(fn, wait) {
    let timer;
    return function() {
        const context = this;
        const args = arguments;
        if (!timer) {
            fn.apply(context, args);
            timer = setTimeout(() => { timer = null; }, wait);
        }
    }
} 
```

里面这一句很灵性，它把“阀门”关上的同时，也设定了一个特定时间后打开阀门的任务。

```js
timer = setTimeout(() => { timer = null; }, wait);
```

