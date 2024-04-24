# Unified Routing API

[![Lint](https://github.com/Uniswap/unified-routing-api/actions/workflows/lint.yml/badge.svg)](https://github.com/Uniswap/unified-routing-api/actions/workflows/lint.yml)
[![Unit Tests](https://github.com/Uniswap/unified-routing-api/actions/workflows/test.yml/badge.svg)](https://github.com/Uniswap/unified-routing-api/actions/workflows/test.yml)

Unified Routing API is a service to route and parameterize all Uniswap trade types.

Currently supported routing types:
- Classic: routes using [Uniswap Routing API](https://github.com/uniswap/routing-api) against the Uniswap v2 and Uniswap v3 AMM protocols
- DutchLimit: parameterizes a UniswapX Dutch Order to be executed by off-chain fillers

## Deployment

### Dev Environment

1. Create a .env file with the necessary dependencies

   ```
   PARAMETERIZATION_API_URL=<>
   ROUTING_API_URL=<>
   SERVICE_URL=<>
   UNISWAP_API='<YourUrl>'
   ARCHIVE_NODE_RPC=<>
   ```

To deploy to your own AWS account,

```
yarn && yarn build
```

then

```
cdk deploy UnifiedRoutingStack
```

after successful deployment, you should see something like

```
 ✅  UnifiedRoutingStack

✨  Deployment time: 93.78s

Outputs:
UnifiedRoutingStack.UnifiedRoutingEndpointEE9D7262 = <your dev url>
UnifiedRoutingStack.Url = <your dev url>
```

The project currently has a `GET hello-world` Api Gateway<>Lambda integration set up:

```
❯ curl <url>/prod/quote/hello-world
"hello world"%
```

## Integration Tests

1. Deploy your API using the intructions above.

2. Add your deployed API url as `UNISWAP_API` and the `ARCHIVE_NODE_RPC` pulled from team secrets to your `.env` file.

   ```
   UNISWAP_API='<YourUrl>'
   ARCHIVE_NODE_RPC=''
   ```

3. Run the tests with:
   ```
   yarn test:integ
   ```
