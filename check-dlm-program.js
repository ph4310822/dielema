const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');

async function checkDLMTokenProgram() {
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const dlmMint = new PublicKey('dVA6zfXBRieUCPS8GR4hve5ugmp5naPvKGFquUDpump');
  
  try {
    const mintInfo = await connection.getAccountInfo(dlmMint);
    const tokenProgram = mintInfo.owner.toBase58();
    
    console.log('DLM Token Mint Address:', dlmMint.toBase58());
    console.log('Token Program used:', tokenProgram);
    console.log('Is Token-2022?', tokenProgram === TOKEN_2022_PROGRAM_ID.toBase58());
    console.log('Is Legacy Token?', tokenProgram === TOKEN_PROGRAM_ID.toBase58());
    
    console.log('\nTOKEN_2022_PROGRAM_ID:', TOKEN_2022_PROGRAM_ID.toBase58());
    console.log('TOKEN_PROGRAM_ID:', TOKEN_PROGRAM_ID.toBase58());
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDLMTokenProgram();
