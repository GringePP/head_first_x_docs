# 浏览器的缓存机制 http cache

## 简介

浏览器有多种缓存机制，比如 Memory cache、Http cache、Service worker 等，这里单独对与 http 相关的 http cache 详细展开来阐述。

http cache 根据设置和场景的不同，又分为强缓存（strong cache）和协商缓存（negotiated cache）。前者直接根据“本地规则”判断是否使用缓存，而后者需要与服务器“协商”后才决定是否使用缓存。

## 强缓存

跟强缓存相关的字段是 pragma、cache-control 和 expires。

### pragma

pragma 是 HTTP1.0 中定义的字段，作用与接下来的 cache-control 类似，其取值有 `no-cache` 和 `no-store`。

### cache-control

cache-control 是 HTTP1.1 中新增的字段，其主要的取值有：`max-age` ，`s-maxage`，`private`，`public`，`immutable`，`no-cache` 和 `no-store` 等。

#### max-age 和 s-maxage

它们都是表示资源存活的时长，以秒为单位，s-maxage 的优先级更高。**代理服务器上只有 `s-maxage` 起作用**。

```
cache-control: max-age=10, s-maxage=5
```

#### private 和 public

表示资源缓存的范围。private 表示资源只缓存在客户端（私有浏览器缓存），而 public 表示资源既可以缓存在客户端，也可缓存在代理服务器上（共享代理缓存）。

private 为缺省值。

上面我们到代理服务器上只有 s-maxage 才会起作用，同时对于设置了 s-maxage 的资源，资源缓存的范围默认为 public。

#### no-cache 和 no-store

no-cache 表示不使用强缓存，即有缓存但是不使用（但还是可以用协商缓存）。而 no-store 就有点过分，不使用的情况下还不进行缓存。

### expires

expires 是 HTTP1.0 中定义的字段，当服务端响应客户端的请求时，会将 expires 字段增加到响应头中，值为资源过期的时间。

```
expires: Tue, 09 Jun 2020 07:20:38 GMT
```

当客户端再发起一次相同请求时，会将客户端时间与该时间对比，如果晚于这个时间则说明资源已经过期，需要重新获取，反之亦然。

但 expire 字段有一个缺点，就是比对的时间为客户端时间，该时间可能与服务端存在时差，并且受系统时间影响。

### 优先级

| 字段          | 优先级 |
| ------------- | ------ |
| pragma        | 高     |
| cache-control | 中     |
| expires       | 低     |

