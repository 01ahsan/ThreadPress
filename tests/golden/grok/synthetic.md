---
title: "Fibonacci in Rust"
source: "Grok"
url: "https://grok.com/c/9f8e7d6c-0000-4000-8000-000000000002"
exported: "2026-10-24T12:00:00.000Z"
---

# Fibonacci in Rust

## You

Write fibonacci in Rust

## Grok

Here is an *iterative* version:

```rust
fn fib(n: u64) -> u64 {
    let (mut a, mut b) = (0, 1);
    for _ in 0..n { (a, b) = (b, a + b); }
    a
}
```

3. Third point
4. Fourth point
