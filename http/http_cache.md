---
title_cn: 浏览器的缓存机制 http cache
title_en: http cache in browser
---

# 浏览器的缓存机制 http cache

## 简介

浏览器有多种缓存机制，比如 Memory cache、Http cache、Service worker 等，这里单独对与 http 相关的 http cache 详细展开来阐述。

http cache 根据设置和场景的不同，又分为强缓存（strong cache）和协商缓存（negotiated cache）。前者直接根据“本地规则”判断是否使用缓存，而后者需要与服务器“协商”后才决定是否使用缓存。

## 强缓存

跟强缓存相关的字段是 `pragma`、`cache-control` 和 `expires`。

### pragma

pragma 是 HTTP1.0 中定义的字段，作用与接下来的 cache-control 类似，其取值有 `no-cache` 和 `no-store`。

### cache-control

cache-control 是 HTTP1.1 中新增的字段，其主要的取值有：`max-age` ，`s-maxage`，`private`，`public`，`immutable`，`no-cache` 和 `no-store` 等。

#### max-age 和 s-maxage

它们都是表示资源存活的时长，以秒为单位，`s-maxage` 的优先级更高。**代理服务器上只有 `s-maxage` 起作用**。

```
cache-control: max-age=10, s-maxage=5
```

#### private 和 public

表示资源缓存的范围。`private` 表示资源只缓存在客户端（私有浏览器缓存），而 `public` 表示资源既可以缓存在客户端，也可缓存在代理服务器上（共享代理缓存）。

`private` 为缺省值。

上面我们到代理服务器上只有 `s-maxage` 才会起作用，同时对于设置了 `s-maxage` 的资源，资源缓存的范围默认为 `public`。

#### no-cache 和 no-store

`no-cache` 表示不使用强缓存，即有缓存但是不使用（但还是可以用协商缓存）。而 `no-store` 就有点过分，即不给不使用缓存，也不进行资源缓存。

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

## 协商缓存

强缓存无法命中的情况主要有下面几种：

1. 时间已超过 cache-control 中定义的 max-age
2. cache-control 设置了 no-cache
3. ...

当浏览器无法命中强缓存后，便会尝试进行与服务端进行协商，看是否还继续使用本地缓存，这种机制我们称之为协商缓存。

协商缓存主要跟两个（套）字段相关，`last-modified/if-modified-since` 和 `etag/if-no-match`。

### last-modified

`last-modified` 是定义在响应头中的一个字段信息，它代表着资源在服务器上最后被修改的时刻（精确到秒）。

```
last-modified: Mon, 05 Feb 2018 09:21:27 GMT
```

在客户端再起重复请求时，会将该字段的值放进请求头中的 `if-modified-since` 中，告知服务器上一次请求时对应的资源最后被修改的时间。

### etag

etag 跟 last-modified 一样，是定义在响应头中的一个字段信息，代表着资源的 hash 值。

```
etag: "5a782217-2db"
```

在客户方发起重复请求时，会将该字段放进请求头中的 if-no-match，告知服务器上一次请求时对应的文件 hash 值。

### 共同作用

上述 last-modified 和 etag 字段到达服务端后，服务端会比对 if-modified-since 的时刻是否早于资源最后被修改的时刻，同时比对 etag 是否与文件 hash 值一致，在两者都不一致的情况下，才会返回新资源，否则则属于“协商”通过，使用本地缓存。

last-modified 和 etag 同时使用，有人可能觉得多余，但其实不然。它们两者是互补的关系，因为可能存在下面两种情况，这两种情况下使用 last-modified 和 etag 才能达到预期的效果：

1. 文件周期性地被修改，但是内容不变（即 last-modified 改变，etag 不变）
2. 文件被修改的间隔时间很短，毫米级（即 etag 改变，last-modified 不能及时更新）

## 状态码

浏览器命中强缓存，均返回 200 状态码；在命中协商缓存，则返回 304 状态码。

