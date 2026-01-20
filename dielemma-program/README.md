

# deploy best practice
## Before deploying, generate a program keypair first:
solana-keygen new -o my-program-keypair.json

## And declare that same ID in your code:
solana_program::declare_id!("<the-actual-id-from-keypair>");
This way you maintain consistency across deployments!

## next deploy 
cargo build-sbf
solana program deploy target/deploy/dielemma_program.so --program-id my-program-keypair.json


# test contracts
npx tsx tests/test-all.ts

# refund from a failed deploy
solana-keygen recover --outfile recovered-buffer-keypair.json --force
solana program close 

# build & deploy with my-program-keypair.json to make sure program id matches
cargo build-bpf && solana program deploy target/deploy/dielemma_program.so --program-id my-program-keypair.json


You ALWAYS FORGET THIS SO I'MMA PUT IT HERE IN EVERY FUCKING CONVERSION:
proofOfLive ONLY USES DLM TOKEN, IT DOES NOT USE ANYTHING ELSE
THE DLM TOKEN IS TOKEN-2022 AND THAT WON't BE CHANGED


solana config get
solana config set --url https://api.devnet.solana.com