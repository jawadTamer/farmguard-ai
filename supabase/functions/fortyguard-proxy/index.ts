import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('FORTYGUARD_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Configuration error',
          message: 'FORTYGUARD_API_KEY environment variable is not configured in the Edge Function' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { method } = req
    const url = new URL(req.url)
    const path = url.pathname.replace('/functions/v1/fortyguard-proxy', '')

    // Parse request body for POST requests
    let body = null
    if (method === 'POST') {
      try {
        body = await req.json()
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    // TODO: When FortyGuard API documentation is available, configure:
    // - Base URL
    // - Endpoints for temperature, forecast, environmental parameters
    // - Request headers
    // - Request body structure
    // - Response mapping

    // For now, return a placeholder response
    return new Response(
      JSON.stringify({ 
        message: 'FortyGuard proxy is ready for configuration',
        note: 'API endpoints will be configured when FortyGuard documentation is available',
        configured: false
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
