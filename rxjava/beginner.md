# RxJava 中的观察者模式

RxJava 是个 JVM 上的异步增强扩展库。具体其背景和作用不在这里赘述，重点关注源码的实现和设计模式。

## 基本成员

### Observable

顾名思义，该类代表被观察的对象，Observable 为抽象类，其中有抽象方法 `subscribeActual` 需要实现类自行定义。

先看下 Observable 类中跟本章相关的方法：

```java
public abstract class Observable<T> implements ObservableSource<T> {
    
    @CheckReturnValue
    @NonNull
    @SchedulerSupport(SchedulerSupport.NONE)
    public static <T> Observable<T> create(ObservableOnSubscribe<T> source) {
        ObjectHelper.requireNonNull(source, "source is null");
        return RxJavaPlugins.onAssembly(new ObservableCreate<T>(source));
    }
    
    
    @SchedulerSupport(SchedulerSupport.NONE)
    @Override
    public final void subscribe(Observer<? super T> observer) {
        ObjectHelper.requireNonNull(observer, "observer is null");
        try {
            observer = RxJavaPlugins.onSubscribe(this, observer);

            ObjectHelper.requireNonNull(observer, "The RxJavaPlugins.onSubscribe hook returned a null Observer. Please change the handler provided to RxJavaPlugins.setOnObservableSubscribe for invalid null returns. Further reading: https://github.com/ReactiveX/RxJava/wiki/Plugins");

            subscribeActual(observer);
        } catch (NullPointerException e) { // NOPMD
            throw e;
        } catch (Throwable e) {
            Exceptions.throwIfFatal(e);
            // can't call onError because no way to know if a Disposable has been set or not
            // can't call onSubscribe because the call might have set a Subscription already
            RxJavaPlugins.onError(e);

            NullPointerException npe = new NullPointerException("Actually not, but can't throw other exceptions due to RS");
            npe.initCause(e);
            throw npe;
        }
    }
    
    protected abstract void subscribeActual(Observer<? super T> observer);
    
    //...  
}
```

### Observer

观察者，通过 Observable 的 subscribe 方法将其与 Observable 关联起来。

同样看下 Observer 中跟本章关系较紧密的几个方法：

```java
public interface Observer<T> {

    void onSubscribe(@NonNull Disposable d);

    void onNext(@NonNull T t);

    void onError(@NonNull Throwable e);

    void onComplete();

}
```

PS：这里有一点容易造成误解，为什么是*被观察者订阅观察者*？其实这是为了格式上更好看，能够支持链式调用。

## 来龙去脉

### 被观察者&事件源头

为了更好地剖析 RxJava 的观察者模式和事件流的原理，我们将自定义 Observable 和 Observer。

利用 Observable 的静态方法可以创建一个自定义的 Observable：

```java
Observable.create(new ObservableOnSubscribe<String>() {
    @Override
    public void subscribe(ObservableEmitter<String> emitter) throws Exception {
        
    }
});
```

create 方法需要传入一个 ObservableOnSubcribe 对象，其便是事件流中的 **源（source）**。

ObservableOnSubscribe 其实是一个接口（所以上面其实是一个匿名实现类），subscribe 是需要实现的方法，由于它是整个事件流的源头，故所有事件都会从 subscribe 方法中产生。

```java
public interface ObservableOnSubscribe<T> {
    void subscribe(@NonNull ObservableEmitter<T> emitter) throws Exception;
}
```

这里我们先不管 subscribe 方法中具体要干什么，先看看 create 方法内部的实现：

```java
public static <T> Observable<T> create(ObservableOnSubscribe<T> source) {
    ObjectHelper.requireNonNull(source, "source is null");
    return RxJavaPlugins.onAssembly(new ObservableCreate<T>(source));
}
```

先不管 RxJavaPlugins 的东西，create 方法最终是返回一个 ObservableCreate 对象，ObservableCreate 是继承于 Observable 的一个实现类，且该会持有 ObservableOnSubscribe 对象：

```java
public final class ObservableCreate<T> extends Observable<T> {
    final ObservableOnSubscribe<T> source;

    public ObservableCreate(ObservableOnSubscribe<T> source) {
        this.source = source;
    }
    //其他方法暂时不展开看
}
```

### 观察者

上面提到，Observable 对象会通过 subscribe 方法绑定 Observer，如下：

```java
Observable.create(new ObservableOnSubscribe<String>() {
        @Override
        public void subscribe(ObservableEmitter<String> emitter) throws Exception {
        }
    })
    .subscribe(new Observer<String>() {
        @Override
        public void onSubscribe(Disposable d) {}

        @Override
        public void onNext(String s) {}

        @Override
        public void onError(Throwable e) {}

        @Override
        public void onComplete() {}
    });
```

我们知道 Observer 也是一个接口，其中的方法当然就是观察到具体事件发生的时候被调用。

### 绑定



那么，接下来就是需要分析，当具体事件发生时，Observer 的回调方法如何被调起的，即这些回调方法如何绑定到事件上。这部分逻辑正是隐藏在 Observable 的 subscribe 的方法中：

```java
public final void subscribe(Observer<? super T> observer) {
    ObjectHelper.requireNonNull(observer, "observer is null");
    try {
        observer = RxJavaPlugins.onSubscribe(this, observer);

        ObjectHelper.requireNonNull(observer, "The RxJavaPlugins.onSubscribe hook returned a null Observer. Please change the handler provided to RxJavaPlugins.setOnObservableSubscribe for invalid null returns. Further reading: https://github.com/ReactiveX/RxJava/wiki/Plugins");

        subscribeActual(observer);
    } catch (NullPointerException e) { // NOPMD
        throw e;
    } catch (Throwable e) {
        Exceptions.throwIfFatal(e);
        // can't call onError because no way to know if a Disposable has been set or not
        // can't call onSubscribe because the call might have set a Subscription already
        RxJavaPlugins.onError(e);

        NullPointerException npe = new NullPointerException("Actually not, but can't throw other exceptions due to RS");
        npe.initCause(e);
        throw npe;
    }
}
```

除了 RxJavaPlugins 和一些异常处理外，注意到一个 subscribeActual 方法，这是 Observable 的抽象方法：

```java
protected abstract void subscribeActual(Observer<? super T> observer);
```

具体到看上面实现类 `ObservableCreate` 中的做法：

```java
public final class ObservableCreate<T> extends Observable<T> {
    final ObservableOnSubscribe<T> source;

    public ObservableCreate(ObservableOnSubscribe<T> source) {
        this.source = source;
    }

    @Override
    protected void subscribeActual(Observer<? super T> observer) {
        CreateEmitter<T> parent = new CreateEmitter<T>(observer);
        observer.onSubscribe(parent);

        try {
            source.subscribe(parent);
        } catch (Throwable ex) {
            Exceptions.throwIfFatal(ex);
            parent.onError(ex);
        }
    }
    //...
}
```

这个方法中主要做了3件事情：

1. 创建 CreateEmitter 实例，并让其持有 Observer
2. 调用 Observer 的 onSubscribe 方法，同时将 CreateEmitter 实例传入（体现为 Disposable）
3. 调用 ObservableOnSubscribe 的 subscribe 方法，并将 CreateEmitter 实例传入

3个步骤中都出现了 CreateEmitter，这个东西很重要，因为正是它把整个 Observable 和 Observer 串起来。这三件事情做完，整个事件流已经可以衔接起来了。还没看懂事件流衔接的同学莫慌，下面发送事件说明中会解释。

### 发送事件

这个时候我们再回过头看 ObservableOnSubscribe 的 subscribe 方法，由于它是整个事件的源头，意味着我们可以在这个方法中产生事件：

```java
Observable.create(new ObservableOnSubscribe<String>() {
        @Override
        public void subscribe(ObservableEmitter<String> emitter) throws Exception {
            emitter.onNext("1");
            emitter.onNext("2");
            emitter.onComplete();
        }
    })
    .subscribe(new Observer<String>() {
        @Override
        public void onSubscribe(Disposable d) {

        }

        @Override
        public void onNext(String s) {

        }

        @Override
        public void onError(Throwable e) {

        }

        @Override
        public void onComplete() {

        }
    });
```

可以看到，我们可以通过 emitter 产生 onNext、onComplete 事件，按照常理，这些事件肯定最终会“流到” Observer 中并调用相应方法。

上面我们也说到了整个事件流已经衔接起来了，那么我们就看看它是怎么从源头流到 Observer 中的。

我们打开 CreateEmitter 详细看（CreateEmitter 是 ObservableCreate 的一个静态内部类）：

```java
static final class CreateEmitter<T>
extends AtomicReference<Disposable>
implements ObservableEmitter<T>, Disposable {

    private static final long serialVersionUID = -3434801548987643227L;

    final Observer<? super T> observer;

    CreateEmitter(Observer<? super T> observer) {
        this.observer = observer;
    }

    @Override
    public void onNext(T t) {
        if (t == null) {
            onError(new NullPointerException("onNext called with null. Null values are generally not allowed in 2.x operators and sources."));
            return;
        }
        if (!isDisposed()) {
            observer.onNext(t);
        }
    }

    @Override
    public void onError(Throwable t) {
        if (!tryOnError(t)) {
            RxJavaPlugins.onError(t);
        }
    }

    @Override
    public boolean tryOnError(Throwable t) {
        if (t == null) {
            t = new NullPointerException("onError called with null. Null values are generally not allowed in 2.x operators and sources.");
        }
        if (!isDisposed()) {
            try {
                observer.onError(t);
            } finally {
                dispose();
            }
            return true;
        }
        return false;
    }

    @Override
    public void onComplete() {
        if (!isDisposed()) {
            try {
                observer.onComplete();
            } finally {
                dispose();
            }
        }
    }

    @Override
    public void setDisposable(Disposable d) {
        DisposableHelper.set(this, d);
    }

    @Override
    public void setCancellable(Cancellable c) {
        setDisposable(new CancellableDisposable(c));
    }

    @Override
    public ObservableEmitter<T> serialize() {
        return new SerializedEmitter<T>(this);
    }

    @Override
    public void dispose() {
        DisposableHelper.dispose(this);
    }

    @Override
    public boolean isDisposed() {
        return DisposableHelper.isDisposed(get());
    }

    @Override
    public String toString() {
        return String.format("%s{%s}", getClass().getSimpleName(), super.toString());
    }
}
```

可见，CreateEmitter 的 onNext、onComplete 和 onError 方法都会调用 Observer 的相应方法（当然调用前会进行 Disposable 接口的相关判断，不属于本篇范畴，故不在此展开讨论）。