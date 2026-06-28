import { Redis } from '@upstash/redis'

//

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

//

export async function fixedWindow({
    key,
    window,
    maxRequests,
    failStrategy = "open"
}: {
    key: string 
    window: number 
    maxRequests: number,
    failStrategy?: "open" | "close"
}) {
    const script = `
        local key = KEYS[1]

        local window = tonumber(ARGV[1])
        local maxRequests = tonumber(ARGV[2])
        local current = redis.call('get', key)
        
        if (not current) then 
            redis.call('setex', key, window, 1)
            
            return 1
        end


        if (current >= maxRequests) then 
            return 0 
        end


        redis.call('incr', key)

        return 1
    `

    try {
        const result = await redis.eval(script, [key], [window, maxRequests]) 

        return result == 1
    } 
    catch (error) {
        console.error("Rate limit error: ", error)

        return failStrategy == "open" 
    }
}


export async function slidingWindow({
    key,
    window,
    maxRequests,
    failStrategy = "open"
}: {
    key: string,
    window: number, 
    maxRequests: number,
    failStrategy?: "open" | "close"
}) {
    const now = Date.now()
    const windowStart = now - window * 1000
    const member = `${now}:${Math.random()}`

    const script = `
        local key = KEYS[1]

        local now = ARGV[1]
        local window = tonumber(ARGV[2])
        local windowStart = tonumber(ARGV[3])
        local maxRequests = tonumber(ARGV[4])
        local member = ARGV[5]

        redis.call('zremrangebyscore', key, 0, windowStart)

        local count = redis.call('zcard', key)

        if (count >= maxRequests) then 
            return 0
        end


        redis.call('zadd', key, now, member)
        redis.call('expire', key, window)

        return 1 
    `

    try {
        const result = await redis.eval(script, [key], [now, window, windowStart, maxRequests, member])

        return result == 1
    } 
    catch (error) {
        console.error("Rate limit error: ", error)

        return failStrategy == "open" 
    }
}


export async function tokenBucket({
    key,
    window,
    maxRequests,
    failStrategy = "open"
}: {
    key: string 
    window: number 
    maxRequests: number
    failStrategy?: "open" | "close"
}) {
    const now = Date.now()

    const script = `
        local key = KEYS[1]

        local now = tonumber(ARGV[1])
        local maxRequests = tonumber(ARGV[2])
        local window = tonumber(ARGV[3])

        local record = redis.call('get', key)

        if (not record) then 
            local data = cjson.encode({
                tokens = maxRequests - 1,
                lastRequest = now
            })

            
            redis.call('setex', key, window, data)

            return 1
        end
        

        record = cjson.decode(record)

        local timeDifference = (now - record.lastRequest) / 1000
        local refill = timeDifference * (maxRequests / window)
        local updatedTokens = math.min(maxRequests, record.tokens + refill)

        if (updatedTokens < 1) then 
            return 0 
        end 


        local data = cjson.encode({
            tokens = updatedTokens - 1,
            lastRequest = now
        }) 


        redis.call('setex', key, window, data)

        return 1
    `

    try {
        const result = await redis.eval(script, [key], [now, maxRequests, window])

        return result == 1
    } 
    catch (error) {
        console.error("Rate limit error: ", error)

        return failStrategy == "open" 
    }
}


export async function leakyBucket({
    key, 
    window, 
    maxRequests,
    failStrategy = "open"
}: {
    key: string,
    window: number,
    maxRequests: number,
    failStrategy?: "open" | "close"
}) {
    const now = Date.now()

    const script = `
        local key = KEYS[1]

        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local maxRequests = tonumber(ARGV[3])

        local record = redis.call('get', key)

        if (not record) then 
            local data = cjson.encode({
                requests = 1,
                lastRequest = now
            })

        
            redis.call('setex', key, window, data)

            return 1 
        end


        record = cjson.decode(record)

        local leakRate = maxRequests / window 
        local elapsedSeconds = (now - record.lastRequest) / 1000
        local leakedRequests = elapsedSeconds * leakRate
        local newRequests = math.max(0, record.requests - leakedRequests) 

        if (newRequests >= maxRequests) then 
            return 0
        end


        local data = cjson.encode({
            requests = newRequests + 1,
            lastRequest = now
        })


        redis.call('setex', key, window, data)

        return 1
    `

    try {
        const result = await redis.eval(script, [key], [now, window, maxRequests])

        return result == 1
    } 
    catch (error) {
        console.error("Rate limit error: ", error)

        return failStrategy == "open" 
    }
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
    const key = `rateLimiter:${endpoint}:${strategy}:${userIP}`

    if (!(strategy in strategies)) {
        strategy = "token-bucket"
    }


    const strategyName = strategy as keyof typeof strategies
    let allowed = false

    allowed = await strategies[strategyName]({
        key: key,
        window: window,
        maxRequests: maxRequests
    })
 

    return allowed
}

 