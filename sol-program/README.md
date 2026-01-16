# build
cargo build-sbf
solana program deploy target/deploy/dielemma_program.so

# test contracts
npx tsx tests/test-all.ts

# refund from a failed deploy
solana-keygen recover --outfile recovered-buffer-keypair.json --force
solana program close 


Best Practice
Before deploying, generate a program keypair first:


solana-keygen new -o my-program-keypair.json
Then use that keypair when deploying:


solana program deploy target/deploy/my_program.so --program-id my-program-keypair.json
And declare that same ID in your code:


solana_program::declare_id!("<the-actual-id-from-keypair>");
This way you maintain consistency across deployments!

# build & deploy with my-program-keypair.json to make sure program id matches
cargo build-bpf && solana program deploy target/deploy/dielemma_program.so --program-id my-program-keypair.json


You ALWAYS FORGET THIS SO I'MMA PUT IT HERE IN EVERY FUCKING CONVERSION:
proofOfLive ONLY USES DLM TOKEN, IT DOES NOT USE ANYTHING ELSE


solana config get
solana config set --url https://api.devnet.solana.com