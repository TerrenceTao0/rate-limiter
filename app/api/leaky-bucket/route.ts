import { rateLimiter } from "@/app/lib/rate-limit"

//

export async function GET(request: Request) {
    const ip = request.headers.get("x-forwarded-for") || "unknown"

    const allowed = await rateLimiter({
        ip: ip, 
        endpoint: "api/leaky-bucket",
        strategy: "leaky-bucket",
        window: 60,
        maxRequests: 10
    })


    if (!allowed) {
        return Response.json(
            { message: "Too many requests" },
            { status: 429 }
        )
    }


    return Response.json(
        { message: "Success" },
        { status: 200 }
    )
}

