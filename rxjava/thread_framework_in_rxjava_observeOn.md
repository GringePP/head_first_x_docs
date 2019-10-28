---
title_cn: RxJava 的线程框架 - observeOn
title_en: Thread framework in RxJava — observeOn
---

# RxJava 的线程框架 - observeOn

## ObservableObserveOn

上一篇讲到 `subscribeOn` 的线程调度原理，我们可以利用 `subscribeOn` 来控制上游事件发出的线程。

其实 `observeOn` 的原理也差不多。subscribeOn 方法是返回一个 ObservableSubscribeOn 对象，`observeOn` 也类似，使用该方法后返回一个 ObservableObserveOn。

```java
@CheckReturnValue
@SchedulerSupport(SchedulerSupport.CUSTOM)
public final Observable<T> observeOn(Scheduler scheduler, boolean delayError) {
    return observeOn(scheduler, delayError, bufferSize());
}

@CheckReturnValue
@SchedulerSupport(SchedulerSupport.CUSTOM)
public final Observable<T> observeOn(Scheduler scheduler, boolean delayError, int bufferSize) {
    ObjectHelper.requireNonNull(scheduler, "scheduler is null");
    ObjectHelper.verifyPositive(bufferSize, "bufferSize");
    return RxJavaPlugins.onAssembly(new ObservableObserveOn<T>(this, scheduler, delayError, bufferSize));
}
```

详细把 ObservableObserveOn 打开来看：

```java
public final class ObservableObserveOn<T> extends AbstractObservableWithUpstream<T, T> {
    final Scheduler scheduler;
    final boolean delayError;
    final int bufferSize;
    public ObservableObserveOn(ObservableSource<T> source, Scheduler scheduler, boolean delayError, int bufferSize) {
        super(source);
        this.scheduler = scheduler;
        this.delayError = delayError;
        this.bufferSize = bufferSize;
    }

    @Override
    protected void subscribeActual(Observer<? super T> observer) {
        if (scheduler instanceof TrampolineScheduler) {
            source.subscribe(observer);
        } else {
            Scheduler.Worker w = scheduler.createWorker();

            source.subscribe(new ObserveOnObserver<T>(observer, w, delayError, bufferSize));
        }
    }
}
```

ObservableObserveOn 跟 ObservableSubscribeOn 一样，也是继承于 AbstractObservableWithUpstream，其关键的方法也是在于 `subscribeActual`：

```java
@Override
protected void subscribeActual(Observer<? super T> observer) {
    if (scheduler instanceof TrampolineScheduler) {
        source.subscribe(observer);
    } else {
        Scheduler.Worker w = scheduler.createWorker();

        source.subscribe(new ObserveOnObserver<T>(observer, w, delayError, bufferSize));
    }
}
```

暂且不关注 `scheduler instanceof TrampolineSchedler` 这一条分支，else 分支中，做了几件事情：

1. 使用传入的 Scheduler 对象，生成 Worker 对象；
2. 利用 Worker 对象和原先的 Observer 对象，封装成 ObserveOnObserver 对象；
3. 将 ObserveOnObserver 对象作为参数，传入到上游 ObservableSource 对象的 `subscribe` 方法中；

对于 Worker 对象，我们在上一篇中也介绍过，以 `Schedulers.io()` 为例，其 Worker 对象为 EventLoopWorker。

接下来，又将 observer 参数包装为 ObserveOnObserver 对象，然后调用上游 Observable 对象的 `subscribe` 方法。

## ObserveOnObserver

ObserveOnObserver 是 ObservableObserveOn 的静态内部类：

```java
static final class ObserveOnObserver<T> extends BasicIntQueueDisposable<T> implements Observer<T>, Runnable 
```

其继承于 BasicIntQueueDisposable，并实现 Observer 和 Runnable 接口。

```java
ObserveOnObserver(Observer<? super T> actual, Scheduler.Worker worker, boolean delayError, int bufferSize) {
    this.downstream = actual;
    this.worker = worker;
    this.delayError = delayError;
    this.bufferSize = bufferSize;
}
```

从 ObserveOnObserver 的构造函数中可以发现，其持有传入的 observer 对象，且标记为其“下游”。

ObserveOnObserver 也是一个 Observer，我们主要关注其 `onSubscribe`、`onNext`、`onError` 和 `onComplete` 的实现细节。

### onSubscribe

```java
@Override
public void onSubscribe(Disposable d) {
    if (DisposableHelper.validate(this.upstream, d)) {
        this.upstream = d;
        if (d instanceof QueueDisposable) {
            @SuppressWarnings("unchecked")
            QueueDisposable<T> qd = (QueueDisposable<T>) d;

            int m = qd.requestFusion(QueueDisposable.ANY | QueueDisposable.BOUNDARY);

            if (m == QueueDisposable.SYNC) {
                sourceMode = m;
                queue = qd;
                done = true;
                downstream.onSubscribe(this);
                schedule();
                return;
            }
            if (m == QueueDisposable.ASYNC) {
                sourceMode = m;
                queue = qd;
                downstream.onSubscribe(this);
                return;
            }
        }

        queue = new SpscLinkedArrayQueue<T>(bufferSize);

        downstream.onSubscribe(this);
    }
}
```

先不用关注其中的复杂逻辑，只需要关注最后 `downstream.onSubscribe(this)` 这一句，它调用了下游 Observer 的 `onSubscribe` 方法，而这个下游 Observer 通常就是用户自己定义的。同时将本身作为参数传入，以为本身已经实现了 Disposable 接口。

另外，我们可以回想一下，`onSubscribe` 这个回调方法是在哪个地方被调用的呢？

其实，如果上游存在 `subscribeOn` 调用的话，是在 ObservableSubscribeOn 的 `subscribeActual` 方法中被调用的，具体可以参考上一篇文章：

```java
@Override
public void subscribeActual(final Observer<? super T> observer) {
    final SubscribeOnObserver<T> parent = new SubscribeOnObserver<T>(observer);

    observer.onSubscribe(parent);		// 就是这一句

    parent.setDisposable(scheduler.scheduleDirect(new SubscribeTask(parent)));
}
```

### onNext

```java
@Override
public void onNext(T t) {
    if (done) {
        return;
    }

    if (sourceMode != QueueDisposable.ASYNC) {
        queue.offer(t);
    }
    schedule();
}
```

`onNext` 方法中，可以看到，将 t 放入到一个队列 `queue` 中，然后重点关注其中的 `schedule` 方法：

```java
void schedule() {
    if (getAndIncrement() == 0) {
        worker.schedule(this);
    }
}
```

`schedule` 方法中，又调用了 worker 的 `schedule` 方法，该 worker 是 `observeOn` 传入的 Scheduler 的 `createWorker` 产生的。

从前一篇文章的分析中得知，`worker.schedule` 方法接受的是实现了 Runnable 接口的对象，最后调用的是其 `run` 方法，此处即为 ObserveOnObserver 的 `run` 方法：

```java
@Override
public void run() {
    if (outputFused) {
        drainFused();
    } else {
        drainNormal();
    }
}
```

这里有两个分支，我们暂且只看 `drainNormal` 这个分支：

```java
void drainNormal() {
    int missed = 1;

    final SimpleQueue<T> q = queue;
    final Observer<? super T> a = downstream;

    for (;;) {
        if (checkTerminated(done, q.isEmpty(), a)) {
            return;
        }

        for (;;) {
            boolean d = done;
            T v;

            try {
                v = q.poll();
            } catch (Throwable ex) {
                Exceptions.throwIfFatal(ex);
                disposed = true;
                upstream.dispose();
                q.clear();
                a.onError(ex);
                worker.dispose();
                return;
            }
            boolean empty = v == null;

            if (checkTerminated(d, empty, a)) {
                return;
            }

            if (empty) {
                break;
            }

            a.onNext(v);
        }

        missed = addAndGet(-missed);
        if (missed == 0) {
            break;
        }
    }
}
```

可以看到方法内部，存在两套循环，都是不断地去轮询，查看 `queue` 是否为空，如果不为空则将值取出（在 `onNext` 方法中我们有将数据放入到队列），调用下游 Observer 的 `onNext` 方法。

### onError/onComplete

对于 `onError` 和 `onComplete`，分析起来也比较简单：

```java
@Override
public void onError(Throwable t) {
    if (done) {
        RxJavaPlugins.onError(t);
        return;
    }
    error = t;
    done = true;
    schedule();
}

@Override
public void onComplete() {
    if (done) {
        return;
    }
    done = true;
    schedule();
}
```

对于 `onError`，在执行 `schedule` 之前，会将 error 赋值为某个 Throwable 对象，并且将 `done` 置为 true，这两个标志位在 `drainNormal` 中是起到关键作用的。详细可以看 `drainNormal` 中的 `checkTerminated` 方法：

```java
boolean checkTerminated(boolean d, boolean empty, Observer<? super T> a) {
    if (disposed) {
        queue.clear();
        return true;
    }
    if (d) {                  // branch 1
        Throwable e = error;
        if (delayError) {     // false default
            if (empty) {
                disposed = true;
                if (e != null) {
                    a.onError(e);
                } else {
                    a.onComplete();
                }
                worker.dispose();
                return true;
            }
        } else {
            if (e != null) {   // branch 2
                disposed = true;
                queue.clear();
                a.onError(e);
                worker.dispose();
                return true;
            } else             // branch 3
                if (empty) {
                    disposed = true;
                    a.onComplete();
                    worker.dispose();
                    return true;
                }
        }
    }
    return false;
}
```

可以看到该方法中，会先判断 d（done） 是否为 true（branch 1)，不是的话直接返回 false；是的话，会再去检查队列是为空，在 onError 的场景中，假设该队列暂不为空且此时 e（error）不为空，那么就会走到 branch 2 分支中，调用下游 Observer 的 `onError` 回调，并返回 true。到了 `drainNormal` 那一层就会直接把方法结束掉了。

对于 `onComplete` 方法，会将 `done` 设为 true，但 `error` 仍为空，此时会走到 branch 3 分支，调用下游 Observer 的 `onComplete` 回调，并返回 true。同样，到了 `drainNormal` 那一层也会将方法结束掉，不会再死循环了。

## Example

下面通过一个简单的实例，将 Observable 的事件流从头到尾再捋一遍。