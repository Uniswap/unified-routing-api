# unified-routing-api

## Deployment

### Dev Environment

1. Create a .env file with the necessary dependencies

   ```
   PARAMETERIZATION_API_URL=<>
   ROUTING_API_URL=<>
   SERVICE_URL=<>
   UNISWAP_API='<YourUrl>'
   ```

To deploy to your own AWS account,

```
yarn && yarn build
```

then

```
cdk deploy GoudaParameterizationStack
```

after successful deployment, you should see something like

```
 ✅  GoudaParameterizationStack

✨  Deployment time: 93.78s

Outputs:
GoudaParameterizationStack.GoudaParameterizationEndpoint57A27B25 = <your dev url>
GoudaParameterizationStack.Url = <your dev url>
```

The project currently has a `GET hello-world` Api Gateway<>Lambda integration set up:

```
❯ curl <url>/prod/quote/hello-world
"hello world"%
```

## Integration Tests

1. Deploy your API using the intructions above.

1. Add your deployed API url to your `.env` file as `UNISWAP_API`

   ```
   UNISWAP_API='<YourUrl>'
   ```

1. Run the tests with:
   ```
   yarn test:integ
   ```
