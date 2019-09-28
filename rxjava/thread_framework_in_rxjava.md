---
title_cn: RxJava 的线程框架
title_en: Thread framework in RxJava
---

# RxJava 的线程框架

我们知道 RxJava 中可以通过 subscribeOn 和 observerOn 来进行线程指定和切换：

```java
Observable.create(new ObservableOnSubscribe<String>() {
    @Override
    public void subscribe(ObservableEmitter<String> emitter) throws Exception {

    }
})
    .subscribeOn(Schedulers.io())
    .observeOn(Schedulers.newThread())
    .subscribe();
```

## subscribeOn

具体我们看下 subscribeOn 方法里的实现：

```java
public final Observable<T> subscribeOn(Scheduler scheduler) {
    ObjectHelper.requireNonNull(scheduler, "scheduler is null");
    return RxJavaPlugins.onAssembly(new ObservableSubscribeOn<T>(this, scheduler));
}
```

这里返回了一个 ObservableSubscribeOn 的类，并且将当前 Observable 对象和 Scheduler 对象传入：

```java
public final class ObservableSubscribeOn<T> extends AbstractObservableWithUpstream<T, T> {
    final Scheduler scheduler;

    public ObservableSubscribeOn(ObservableSource<T> source, Scheduler scheduler) {
        super(source);
        this.scheduler = scheduler;
    }

    @Override
    public void subscribeActual(final Observer<? super T> observer) {
        final SubscribeOnObserver<T> parent = new SubscribeOnObserver<T>(observer);

        observer.onSubscribe(parent);

        parent.setDisposable(scheduler.scheduleDirect(new SubscribeTask(parent)));
    }
}
```

这里的 ObservableSubscribeOn 也是一个间接继承于 Observable 的类（ObservableSubscribeOn->AbstractObservableWithUpstream->Observable），而且我们知道 subscribe 方法最终会调用到 Observable 的 subscribeActual 方法，所以这里重点关注：

```java
@Override
public void subscribeActual(final Observer<? super T> observer) {
    final SubscribeOnObserver<T> parent = new SubscribeOnObserver<T>(observer);

    observer.onSubscribe(parent);

    parent.setDisposable(scheduler.scheduleDirect(new SubscribeTask(parent)));
}
```

