#!/bin/bash

echo "Deploying Dielemma Backend to Railway"
echo "=========================================="
echo ""

# Copy shared folder before deployment
echo "Step 0: Copying shared folder..."
rm -rf shared
cp -r ../shared .
echo "✅ Shared folder copied"
echo ""

# Check if logged in to Railway
echo "Step 1: Checking Railway authentication..."
npx @railway/cli whoami > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Not logged in to Railway. Please login first:"
    echo "   npx @railway/cli login"
    echo "   Then run this script again."
    exit 1
fi

echo "Already logged in to Railway"
echo ""

# Deploy
echo "Step 2: Deploying to Railway..."
npx @railway/cli up
echo ""

# Get deployment URL
echo "Deployment successful!"
echo ""
echo "Your backend is deployed at:"
npx @railway/cli domain
echo ""
echo "Environment variables are loaded from railway.toml"
