import { Redis } from '@upstash/redis'

//

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

//

export async function fixedWindow({
    key,
    record, 
    window,
    maxRequests 
}: {
    key: string 
    record: any 
    window: number 
    maxRequests: number 
}) {
    if (record == null) {
        await redis.set(key, 1, { ex: window })

        return true 
    }

    
    if (record >= maxRequests) {
        return false 
    }
    

    await redis.incr(key)

    return true 
}


export async function slidingWindow({
    key,
    window,
    maxRequests
}: {
    key: string,
    window: number, 
    maxRequests: number
}) {
    const now = Date.now()
    const windowStart = now - window * 1000

    await redis.zadd(key, {
        score: now,
        member: now.toString()
    })


    await redis.zremrangebyscore(key, 0, windowStart)
    await redis.expire(key, window)

    const count = await redis.zcard(key)

    if (count > maxRequests) {
        return false 
    }


    return true 
}


export async function tokenBucket({
    key,
    record, 
    window,
    maxRequests 
}: {
    key: string 
    record: any 
    window: number 
    maxRequests: number 
}) {
    const now = Date.now()

    if (record == null) {
        await redis.set(key, {
            tokens: maxRequests - 1,
            lastRequest: now
        }, {
            ex: window 
        })


        return true 
    }


    const timeDifference = (now - record.lastRequest) / 1000
    const refill = timeDifference * (maxRequests / window)
    const updatedTokens = Math.min(maxRequests, record.tokens + refill)

    if (updatedTokens < 1) {
        return false 
    } 
    

    await redis.set(key, {
        tokens: updatedTokens - 1,
        lastRequest: now
    }, {
        ex: window
    })


    return true 
}


export async function leakyBucket({
    key, 
    record, 
    window, 
    maxRequests
}: {
    key: string,
    record: any,
    window: number,
    maxRequests: number
}) {
    const now = Date.now()

    if (record == null) {
        await redis.set(key, {
            requests: 1,
            lastRequest: now
        }, {
            ex: window
        })


        return true
    }


    const leakRate = maxRequests / window 
    const elapsedSeconds = (now - record.lastRequest) / 1000
    const leakedRequests = elapsedSeconds * leakRate
    const newRequests = Math.max(0, record.requests - leakedRequests) 

    if (newRequests >= maxRequests) { 
        return false 
    }


    await redis.set(key, {
        requests: newRequests + 1,
        lastRequest: now 
    }, {
        ex: window
    })


    return true 
}

//

const strategies = {
    "fixed-window": fixedWindow,
    "sliding-window": slidingWindow,
    "token-bucket": tokenBucket,
    "leaky-bucket": leakyBucket
}

export async function rateLimiter({
    ip, 
    endpoint,
    strategy = "token-bucket",
    window = 60,
    maxRequests = 5
}: {
    ip: string,
    endpoint: string, 
    strategy: string,
    window: number,
    maxRequests: number
}) {
    const userIP = ip.split(",")[0].trim()
    const key = `rateLimiter:${endpoint}:${userIP}`

    if (!(strategy in strategies)) {
        strategy = "token-bucket"
    }


    const strategyName = strategy as keyof typeof strategies
    let allowed = false

    if (strategyName == "sliding-window") {
        allowed = await slidingWindow({
            key: key,
            window: window,
            maxRequests: maxRequests
        })
    }
    else {
        const record = await redis.get(key)

        allowed = await strategies[strategyName]({
            key: key,
            record: record,
            window: window,
            maxRequests: maxRequests
        })
    }
 

    return allowed
}

