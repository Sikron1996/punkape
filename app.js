import { ethers } from "https://esm.sh/ethers@6.13.4";
import EthereumProvider from "https://esm.sh/@walletconnect/ethereum-provider@2.17.2";

const CONTRACT_ADDRESS = "0x3985A9008989E6348Aa8f18115391953357e4bC1";
const PROJECT_ID = "fe55ea601c3e7e0925c0b33723d6b158";
const READ_RPC = "https://ethereum.publicnode.com";
const PRICE_ETH = "0.000032";
const MAX_SUPPLY = 10000;

const ABI = [
  "function mint(uint256 amount) external payable",
  "function PRICE() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function minted(address user) view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function totalMintAttempts() view returns (uint256)"
];

let provider, signer, contract, readProvider, readContract, account, wcProvider;

const $ = id => document.getElementById(id);
const modal = $("walletModal");

function status(t){ $("status").textContent = t; }
function openModal(){ modal.classList.remove("hidden"); }
function closeModal(){ modal.classList.add("hidden"); }

function amount(){
  let a = Number($("amount").value);
  if(!a || a < 1) a = 1;
  if(a > 100) a = 100;
  $("amount").value = a;
  return a;
}

function setNum(id, n){
  const el = $(id);
  if(el) el.textContent = Number(n).toLocaleString();
}

function updateDashboard(survived, burned, attempts){
  const remaining = Math.max(0, MAX_SUPPLY - survived);

  setNum("mintedText", attempts);
  setNum("mintedMini", survived);
  setNum("burnedText", burned);
  setNum("survivedText", survived);
  setNum("remainingText", remaining);

  const pct = Math.min(100, (attempts / MAX_SUPPLY) * 100);
  $("progressBar").style.width = pct.toFixed(1) + "%";
  $("progressText").textContent = pct.toFixed(1) + "% MINTED";
}

function initRead(){
  if(CONTRACT_ADDRESS === "PASTE_CONTRACT_ADDRESS_HERE"){
    updateDashboard(0, 0, 0);
    status("Insert contract address in app.js");
    return false;
  }

  readProvider = new ethers.JsonRpcProvider(READ_RPC);
  readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
  return true;
}

async function loadStats(){
  try{
    if(!readContract && !initRead()) return;

    const survived = Number(await readContract.totalSupply());

    let burned = 0;
    try { burned = Number(await readContract.totalBurned()); } catch(e){}

    let attempts = survived + burned;
    try { attempts = Number(await readContract.totalMintAttempts()); } catch(e){}

    updateDashboard(survived, burned, attempts);
    await updatePrice();
  }catch(e){
    status("Read error: " + (e.shortMessage || e.message));
  }
}

async function setup(walletProvider, acc){
  if(CONTRACT_ADDRESS === "PASTE_CONTRACT_ADDRESS_HERE"){
    throw new Error("Insert contract address in app.js");
  }

  provider = new ethers.BrowserProvider(walletProvider);
  signer = await provider.getSigner();
  account = acc || await signer.getAddress();

  contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  readContract = contract;

  $("wallet").textContent = account.slice(0,6) + "..." + account.slice(-4);
  $("topConnect").textContent = account.slice(0,6) + "..." + account.slice(-4);
  $("connectBtn").style.display = "none";
  $("mintBtn").style.display = "inline-block";

  closeModal();
  await loadStats();
}

async function connectBrowser(){
  try{
    if(!window.ethereum) throw new Error("Wallet not found");

    if(await window.ethereum.request({method:"eth_chainId"}) !== "0x1"){
      await window.ethereum.request({
        method:"wallet_switchEthereumChain",
        params:[{chainId:"0x1"}]
      });
    }

    const acc = await window.ethereum.request({method:"eth_requestAccounts"});
    await setup(window.ethereum, acc[0]);
  }catch(e){
    status("Error: " + (e.shortMessage || e.message));
  }
}

async function connectWC(){
  try{
    wcProvider = await EthereumProvider.init({
      projectId: PROJECT_ID,
      chains:[1],
      optionalChains:[1],
      showQrModal:true
    });

    await wcProvider.connect();
    await setup(wcProvider, (wcProvider.accounts || [])[0]);
  }catch(e){
    status("Error: " + (e.shortMessage || e.message));
  }
}

async function getPrice(){
  if(contract){
    try { return await contract.PRICE(); } catch(e){}
  }
  return ethers.parseEther(PRICE_ETH);
}

async function getPaidAmount(){
  const qty = BigInt(amount());

  if(!contract || !account){
    return qty > 0n ? qty - 1n : 0n;
  }

  const already = await contract.minted(account);
  return already === 0n ? qty - 1n : qty;
}

async function updatePrice(){
  try{
    const price = await getPrice();
    const paid = await getPaidAmount();
    const total = price * paid;

    $("totalPrice").textContent =
      total === 0n ? "FREE" : ethers.formatEther(total) + " ETH";
  }catch(e){
    status("Price error: " + (e.shortMessage || e.message));
  }
}

async function mint(){
  try{
    if(!contract){
      openModal();
      return;
    }

    const qty = BigInt(amount());
    const price = await getPrice();
    const paid = await getPaidAmount();

    status("Confirm mint...");
    const tx = await contract.mint(Number(qty), {
      value: price * paid
    });

    status("Tx: " + tx.hash);
    await tx.wait();

    status("Mint success");
    await loadStats();
  }catch(e){
    status("Error: " + (e.shortMessage || e.message));
  }
}

$("topConnect").onclick = openModal;
$("connectBtn").onclick = openModal;
$("closeModalBtn").onclick = closeModal;
$("browserWalletBtn").onclick = connectBrowser;
$("walletConnectBtn").onclick = connectWC;
$("mintBtn").onclick = mint;

$("minus").onclick = async () => {
  $("amount").value = Math.max(1, amount() - 1);
  await updatePrice();
};

$("plus").onclick = async () => {
  $("amount").value = Math.min(100, amount() + 1);
  await updatePrice();
};

$("amount").oninput = updatePrice;

let imgIndex = 0;
setInterval(() => {
  if(!window.APE_IMAGES || !window.APE_IMAGES.length) return;
  imgIndex = (imgIndex + 1) % window.APE_IMAGES.length;
  $("preview").src = window.APE_IMAGES[imgIndex];
}, 1700);

initRead();
loadStats();
updatePrice();
