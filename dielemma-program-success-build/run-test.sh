#!/bin/bash

# Dielemma Program Test Runner

echo "=== Dielemma Program Test Runner ==="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found. Please install Node.js first."
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo ""
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "✗ Failed to install dependencies"
        exit 1
    fi
    echo "✓ Dependencies installed"
fi

echo ""
echo "Running tests..."
echo ""

# Run the test
npm test

echo ""
echo "=== Done ==="
