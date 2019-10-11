---
title_cn: RxJava 的线程框架 - subscribeOn
title_en: Thread framework in RxJava — subscribeOn
---

# RxJava 的线程框架 - subscribeOn

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

## Scheduler

Scheduler 是 RxJava2 线程框架中极为重要的一个角色，所以此处将其提到最先来分析。

### 基本概念

#### Scheduler

Scheduler 是调度器的基类（抽象类），其定义了几个比较重要的接口和方法，这里我们只关注其中的片段：

```java
public abstract class Scheduler {
    
    @NonNull
    public abstract Worker createWorker();
    
    @NonNull
    public Disposable scheduleDirect(@NonNull Runnable run) {
        return scheduleDirect(run, 0L, TimeUnit.NANOSECONDS);
    }

    @NonNull
    public Disposable scheduleDirect(@NonNull Runnable run, long delay, @NonNull TimeUnit unit) {
        final Worker w = createWorker();

        final Runnable decoratedRun = RxJavaPlugins.onSchedule(run);

        DisposeTask task = new DisposeTask(decoratedRun, w);

        w.schedule(task, delay, unit);

        return task;
    }
    //...
}
```

其中，`createWorker` 方法是需要上层具体类去实现的，后面我们会深入分析。而 scheduleDirect 方法则是所有 Scheduler 对象公用的一段逻辑，属于调度器的核心代码片段，后面也会深入分析。

#### Schedulers

Schedulers 可以理解为 Scheduler 的工具类，提供 `io()/newThread()/computation()` 等快捷方法获取 Scheduler 对象。

把 Schedulers 详细打开看下：

```java
public final class Schedulers {
    @NonNull
    static final Scheduler SINGLE;

    @NonNull
    static final Scheduler COMPUTATION;

    @NonNull
    static final Scheduler IO;

    @NonNull
    static final Scheduler TRAMPOLINE;

    @NonNull
    static final Scheduler NEW_THREAD;

    static final class SingleHolder {
        static final Scheduler DEFAULT = new SingleScheduler();
    }

    static final class ComputationHolder {
        static final Scheduler DEFAULT = new ComputationScheduler();
    }

    static final class IoHolder {
        static final Scheduler DEFAULT = new IoScheduler();
    }

    static final class NewThreadHolder {
        static final Scheduler DEFAULT = new NewThreadScheduler();
    }

    static {
        SINGLE = RxJavaPlugins.initSingleScheduler(new SingleTask());

        COMPUTATION = RxJavaPlugins.initComputationScheduler(new ComputationTask());

        IO = RxJavaPlugins.initIoScheduler(new IOTask());

        TRAMPOLINE = TrampolineScheduler.instance();

        NEW_THREAD = RxJavaPlugins.initNewThreadScheduler(new NewThreadTask());
    }

    /** Utility class. */
    private Schedulers() {
        throw new IllegalStateException("No instances!");
    }
    
    @NonNull
    public static Scheduler io() {
        return RxJavaPlugins.onIoScheduler(IO);
    }
    
    @NonNull
    public static Scheduler computation() {
        return RxJavaPlugins.onComputationScheduler(COMPUTATION);
    }
    
    @NonNull
    public static Scheduler trampoline() {
        return TRAMPOLINE;
    }
    
    @NonNull
    public static Scheduler newThread() {
        return RxJavaPlugins.onNewThreadScheduler(NEW_THREAD);
    }
    
    @NonNull
    public static Scheduler single() {
        return RxJavaPlugins.onSingleScheduler(SINGLE);
    }
    
    //...
}
```

以我们常用的 io() 为例：

```java
// Schedulers.java

@NonNull
static final Scheduler IO;

static final class IoHolder {
    static final Scheduler DEFAULT = new IoScheduler();
}

static {
    IO = RxJavaPlugins.initIoScheduler(new IOTask());
}

@NonNull
public static Scheduler io() {
    return RxJavaPlugins.onIoScheduler(IO);
}

static final class IOTask implements Callable<Scheduler> {
    @Override
    public Scheduler call() throws Exception {
        return IoHolder.DEFAULT;
    }
}
```

执行 `Schedulers.io()` 的调用后直接返回 IO 实例，IO 实例是静态执行的，其调用顺序如下：

1. `RxJavaPlugins.initIoScheduler(new IOTask())` 实际上会调用返回 IOTask 的 `call` 方法
2. IOTask 的 `call` 方法返回 `IoHolder.DEFAULT`
3. `IoHolder.DEFAULT` 实际上在早前已被赋值为 IoScheduler 实例

综上，`Schedulers.io()` 最终是返回 IoScheduler 实例。

### IoScheduler

这里先说一下 Scheduler 是怎么在 Observable 和 Observer 中间被应用的，就 `subscribeOn` 这个操作来看的话，就只有一句代码涉及：

```java
// ObservableSubscribeOn.java

@Override
public void subscribeActual(final Observer<? super T> observer) {
    final SubscribeOnObserver<T> parent = new SubscribeOnObserver<T>(observer);

    observer.onSubscribe(parent);

    parent.setDisposable(scheduler.scheduleDirect(new SubscribeTask(parent))); // this one
}
```

最后一行，Scheduler 对象的 `scheduleDirect` 方法被调用。

那么，这里我们就以 IoScheduler 的 `scheduleDirect` 作为入口，来进行 Scheduler 的调度分析，这里说 IoScheduler 的 `scheduleDirect` 其实不准确，`scheduleDirect` 是定义在基类 Scheduler 中的：

```java
// Scheduler.java

@NonNull
public Disposable scheduleDirect(@NonNull Runnable run, long delay, @NonNull TimeUnit unit) {
    final Worker w = createWorker();

    final Runnable decoratedRun = RxJavaPlugins.onSchedule(run);

    DisposeTask task = new DisposeTask(decoratedRun, w);

    w.schedule(task, delay, unit);

    return task;
}
```

`createWorker` 方法是抽象的，所以我们看看 IoScheduler 是怎么实现的：

```java
// IoScheduler.java

@NonNull
@Override
public Worker createWorker() {
    return new EventLoopWorker(pool.get());
}
```

好吧，好像到这里事情变复杂了，多了几个相关的概念：

* Worker
* EventLoopWorker
* CachedWorkerPool（即片段中的 pool）

Worker 这里我们暂且理解为线程调度中最小的任务单元，具体把下面两者打开来看吧。

#### EventLoopWorker

EventLoopWorker 是 IoScheduler 类中一个内部类，其实现具体如下：

```java
static final class EventLoopWorker extends Scheduler.Worker {
    private final CompositeDisposable tasks;
    private final CachedWorkerPool pool;
    private final ThreadWorker threadWorker;

    final AtomicBoolean once = new AtomicBoolean();

    EventLoopWorker(CachedWorkerPool pool) {
        this.pool = pool;
        this.tasks = new CompositeDisposable();
        this.threadWorker = pool.get();
    }

    @Override
    public void dispose() {
        if (once.compareAndSet(false, true)) {
            tasks.dispose();

            // releasing the pool should be the last action
            pool.release(threadWorker);
        }
    }

    @Override
    public boolean isDisposed() {
        return once.get();
    }

    @NonNull
    @Override
    public Disposable schedule(@NonNull Runnable action, long delayTime, @NonNull TimeUnit unit) {
        if (tasks.isDisposed()) {
            // don't schedule, we are unsubscribed
            return EmptyDisposable.INSTANCE;
        }

        return threadWorker.scheduleActual(action, delayTime, unit, tasks);
    }
}
```

可以看到 EventLoopWorker 继承了 Scheduler.Work，并实现了其中几个抽象方法，较为重要的是 `schedule` 方法，因为在 Scheduler 的 `scheduleDirect` 方法中，正是该方法被调用。

观察到 schedule 中实际是调用了 ThreadWorker 对象的 `scheduleActual` 方法，再把 ThreadWorker 打开看下，它也是 IoScheduler 的一个内部类：

```java
static final class ThreadWorker extends NewThreadWorker {
    private long expirationTime;

    ThreadWorker(ThreadFactory threadFactory) {
        super(threadFactory);
        this.expirationTime = 0L;
    }

    public long getExpirationTime() {
        return expirationTime;
    }

    public void setExpirationTime(long expirationTime) {
        this.expirationTime = expirationTime;
    }
}
```

ThreadWorker 具体是继承 NewThreadWorker 类，我们就不往下再深入去看了，**只需要知道的是 ThreadWorker 对象的 `scheduleActual` 方法，内部使用了线程池去执行传入的 Runnable 对象。**

#### CachedWorkerPool

这个类也是 IoScheduler 的一个内部类，顾名思义，它是一个缓存 Worker 的“池子”。

在 IoScheduler 这个例子中，我们只需要记住它是用来缓存 ThreadWorker 的就可以了。

具体体现在 IoScheduler 的 `createWorker` 方法中：

```java
@NonNull
@Override
public Worker createWorker() {
    return new EventLoopWorker(pool.get());		// pool 即为 CachedWorkerPool 对象
}
```

## subscribeOn

讲完了 Scheduler 的基本情况，下面可以具体看下 `subscribeOn` 方法里的实现：

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

这里的 ObservableSubscribeOn 也是一个间接继承于 Observable 的类（ObservableSubscribeOn->AbstractObservableWithUpstream->Observable），而且我们知道 `subscribe` 方法最终会调用到 Observable 的 `subscribeActual` 方法，所以这里重点关注：

```java
@Override
public void subscribeActual(final Observer<? super T> observer) {
    final SubscribeOnObserver<T> parent = new SubscribeOnObserver<T>(observer);

    observer.onSubscribe(parent);

    parent.setDisposable(scheduler.scheduleDirect(new SubscribeTask(parent)));
}
```

在这个方法中，主要做了三件事：

* 将传入的 Observer 对象包装成 SubscribeOnObserver 对象，名为 parent；
* 调用 observer 对象的 onSubscribe 回调方法，并且将 parent 传入？
* 对 parent 对象做复杂操作
  * 利用 parent 对象新建 SubscribeTask 对象；
  * 将 SubscribeTask 对象作为参数传入到 scheduler 的 scheduleDirect 方法中去；
  * 将 schedulerDirect 的返回值作为 Disposable 对象传入到 parent 的 setDisposable 方法中；

下面一步步拆开看吧。

### SubscribeOnObserver

SubscribeOnObserver 是 ObservableSubscribeOn 的一个静态内部类，其继承于 AtomicReference，并实现 Observer 和 Disposable 接口：

```java
static final class SubscribeOnObserver<T> extends AtomicReference<Disposable> implements Observer<T>, Disposable {

    private static final long serialVersionUID = 8094547886072529208L;
    final Observer<? super T> downstream;

    final AtomicReference<Disposable> upstream;

    SubscribeOnObserver(Observer<? super T> downstream) {
        this.downstream = downstream;
        this.upstream = new AtomicReference<Disposable>();
    }
    
    //...
}
```

可以看到，其构造方法是将传入的 observer 作为其 downstream（下游）。

### SubscribeTask

SubscribeTask 是 ObservableSubscribeOn 的一个内部类，直接继承于 Runnable：

```java
final class SubscribeTask implements Runnable {
    private final SubscribeOnObserver<T> parent;

    SubscribeTask(SubscribeOnObserver<T> parent) {
        this.parent = parent;
    }

    @Override
    public void run() {
        source.subscribe(parent);
    }
}
```

其持有 SubscribeOnObserver 对象，并且在回调方法 run 中，会执行 source 的 `subscribe` 方法。而这里的 source，即是 ObservableSubscribeOn 的构造方法中传入的 ObservableSource 对象。**即上游的 source 直接 subscribe 的不再是传入的 observer，而是这里被包装好的 SubscribeOnObserver。**

### scheduleDirect

scheduleDirect 是抽象类 Scheduler 中的一个方法，上面我们知道这个方法的实现如下，它只有短短 5 行代码，**但却深藏着 Scheduler 线程调度的精髓。**

```java
// Scheduler.java

@NonNull
public Disposable scheduleDirect(@NonNull Runnable run, long delay, @NonNull TimeUnit unit) {
    final Worker w = createWorker();

    final Runnable decoratedRun = RxJavaPlugins.onSchedule(run);

    DisposeTask task = new DisposeTask(decoratedRun, w);

    w.schedule(task, delay, unit);

    return task;
}
```

1. createWorker 的实现由各个非抽象的 Scheduler 对象实现，如 IoScheduler 是返回一个 EventLoopWorker 对象。
2. line7 和 line9，是将 Runnable 对象利用 RxJavaPlugins 和 DisposeTask 封装了一下，其本质还是原始传入的 Runnable 对象
3. 重头戏就在于 w.schedule 这一句，w 是 Worker 对象，由各个 Scheduler 控制其内部实现

## XXWoker#schedule

这里还是以 IoScheduler 的 EventLoopWorker 为例，详细看看 schedule 方法具体会发生什么。

```java
@NonNull
@Override
public Disposable schedule(@NonNull Runnable action, long delayTime, @NonNull TimeUnit unit) {
    if (tasks.isDisposed()) {
        // don't schedule, we are unsubscribed
        return EmptyDisposable.INSTANCE;
    }

    return threadWorker.scheduleActual(action, delayTime, unit, tasks);
}
```

上面是 EventLoopWorker 的 schedule 方法， 可以看到最终是 ThreadWorker 对象执行了 scheduleActual 方法，这里我们只需要知道最后是利用线程池去执行 Runnable 对象，往下我们就不细究了。这个时候其实我们已经离最初的分析入口 subscribeOn 方法比较远了，所以我们现在沿着调用链往回走。

这里的 Runnable，我们知道是在 Scheduler 的 scheduleDirect 方法中传入的：

```java
// Scheduler.java

@NonNull
public Disposable scheduleDirect(@NonNull Runnable run, long delay, @NonNull TimeUnit unit) {
    final Worker w = createWorker();

    final Runnable decoratedRun = RxJavaPlugins.onSchedule(run);

    DisposeTask task = new DisposeTask(decoratedRun, w);

    w.schedule(task, delay, unit);

    return task;
}
```

即其中的 DisposeTask 对象，其又来源于传入的 Runnable 对象，那我们再寻找调用的地方，是在 ObservableSubscribeOn 中：

```java
// ObservableSubscribeOn.java

@Override
public void subscribeActual(final Observer<? super T> observer) {
    final SubscribeOnObserver<T> parent = new SubscribeOnObserver<T>(observer);

    observer.onSubscribe(parent);

    parent.setDisposable(scheduler.scheduleDirect(new SubscribeTask(parent)));
}
```

明显是上面的 Runnable 是来自于这个 SubscribeTask，其实上面我们也看过了 SubscribeTask 的内部实现：

```java
final class SubscribeTask implements Runnable {
    private final SubscribeOnObserver<T> parent;

    SubscribeTask(SubscribeOnObserver<T> parent) {
        this.parent = parent;
    }

    @Override
    public void run() {
        source.subscribe(parent);
    }
}
```

其接收 SubscribeOnObserver 对象，而且作为 ObservableSubscribeOn 的内部类，持有对 source 的引用（ObservableSource 对象）。

**这里我们可以很清晰地看到，run 方法中，执行了 source 的 subscribe 方法，而这个 run 方法，最终又是在 NewThreadWorker 中以线程池的方式运行，这也就实现了 subscribeOn 的线程调度。**

## Example

最后以一个实际的例子，来说明 subscribeOn 的作用原理。

```java
Observable.create(new ObservableOnSubscribe<String>() {
    @Override
    public void subscribe(ObservableEmitter<String> emitter) throws Exception {
        emitter.onNext("test");
        emitter.onComplete();
    }
}).subscribeOn(Schedulers.io())
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

1. Observable.create 传入一个 ObservableOnSubscribe 对象，将其作为 source，返回 Observable 对象，实际是 ObservableCreate 对象
2. subscribeOn 传入一个 IoScheduler 对象，返回 Observable 对象，实际是 ObservableSubscribeOn 对象
3. 调用 Observable 的 subscribe 方法，传入 Observer 对象，接下来会陆续发生这几件事情：
   1. 在当前线程调用 Observer 的 onSubscribe 回调方法
   2. 将上游 Observable 对象 subscribe 方法的调用，封装到一个 Runnable 对象中
   3. 在 Scheduler 内部，调用起 createWorker 抽象方法，对 IoScheduler 而言，是返回一个 EventLoopWorker
   4. 利用 Worker 的 schedule 方法去执行第二步的 Runnable 对象，实际是调用了 source 的 subscribe 方法，即我们最初的那个 ObservableOnSubscribe 的 subscribe 方法，实现 subscribeOn 控制订阅的线程





![](https://ykbjson.github.io/blogimage/rxjava2-2/rxjava2-observeOn%E7%B1%BB%E5%9B%BE.png)

*图片参考自 ykbjson.github.io*