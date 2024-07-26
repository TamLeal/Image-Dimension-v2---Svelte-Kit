<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { slide } from 'svelte/transition';
  import FileUpload from '$lib/FileUpload.svelte';

  let sampleFiles = [];
  let manufacturerFiles = [];
  const results = writable({});
  let pendingPairs = new Set();
  let showSidebar = true;


 function handleSampleUpload(files) {
  sampleFiles = Array.from(files);
  pendingPairs.clear();
}

function handleManufacturerUpload(files) {
  manufacturerFiles = Array.from(files);
  pendingPairs.clear();
}

  async function processImages() {
    // Simular processamento (substitua com a lógica real depois)
    for (let i = 0; i < Math.min(sampleFiles.length, manufacturerFiles.length); i++) {
      if (pendingPairs.has(i)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        results.update(r => ({
          ...r,
          [i]: {
            sampleImage: sampleFiles[i],
            manufacturerImage: manufacturerFiles[i],
            scale: (Math.random() * 0.01).toFixed(4),
            width: (Math.random() * 30).toFixed(2),
            height: (Math.random() * 20).toFixed(2)
          }
        }));
        pendingPairs.delete(i);
      }
    }
  }

  function togglePair(index) {
    if (pendingPairs.has(index)) {
      pendingPairs.delete(index);
    } else {
      pendingPairs.add(index);
    }
    pendingPairs = pendingPairs;
  }

$: bothUploadsCompleted = sampleFiles.length > 0 && manufacturerFiles.length > 0;
$: selectAll = bothUploadsCompleted && pendingPairs.size === manufacturerFiles.length;

function toggleAllPairs() {
  if (!bothUploadsCompleted) return; // Não faz nada se ambos os uploads não estiverem completos

  if (pendingPairs.size === manufacturerFiles.length) {
    // Se todos estão selecionados, desmarcar todos
    pendingPairs.clear();
  } else {
    // Caso contrário, selecionar todos
    for (let i = 0; i < manufacturerFiles.length; i++) {
      pendingPairs.add(i);
    }
  }
  pendingPairs = new Set(pendingPairs); // Força a atualização do conjunto
}

  function toggleSidebar() {
    showSidebar = !showSidebar;
  }

  $: thumbnailUrls = manufacturerFiles.map(file => URL.createObjectURL(file));
</script>

<div class="container">
  <div class="sidebar-container" class:collapsed={!showSidebar}>
    {#if showSidebar}
      <div class="sidebar" transition:slide={{duration: 300, axis: 'x'}}>
        <section class="upload-section">
          <h2>Image Upload</h2>
          <FileUpload 
            label="Upload Sample Images" 
            multiple={true} 
            accept="image/*" 
            onFileSelect={handleSampleUpload}
          />
          <FileUpload 
            label="Upload Manufacturer Images" 
            multiple={true} 
            accept="image/*" 
            onFileSelect={handleManufacturerUpload}
          />
        </section>
        
        <section class="select-pairs">
          <h2>Select Pairs to Process</h2>
          {#if bothUploadsCompleted}
            <label class="select-all-checkbox">
              <input type="checkbox" bind:checked={selectAll} on:change={toggleAllPairs}>
              <span class="checkmark"></span>
              Select All Pairs
            </label>
            <div class="pair-list">
              {#each manufacturerFiles as file, index}
                <label class="pair-item">
                  <input type="checkbox" checked={pendingPairs.has(index)} on:change={() => togglePair(index)}>
                  <img src={thumbnailUrls[index]} alt="Thumbnail" class="thumbnail" />
                  Pair {index + 1}
                </label>
              {/each}
            </div>
          {:else}
            <p>Upload both sample and manufacturer images to select pairs.</p>
          {/if}
        </section>
        
        <button class="fancy-button process-button" on:click={processImages}>Process Selected Pairs</button>
      </div>
    {/if}
    <button class="toggle-sidebar" on:click={toggleSidebar}>
      <span class="icon">{showSidebar ? '◀' : '▶'}</span>
    </button>
  </div>
  
  <div class="main-content">
    {#each Object.entries($results) as [index, result]}
      <div class="processed-pair">
        <h3>Processed Pair {parseInt(index) + 1}</h3>
        <div class="image-container">
          <img src={URL.createObjectURL(result.sampleImage)} alt="Sample Image with Coin Detected" />
          <img src={URL.createObjectURL(result.manufacturerImage)} alt="Manufacturer Image with Matches" />
        </div>
        <div class="result-info">
          <p>Scale (inches/pixel): {result.scale}</p>
          <p>Width: {result.width} inches</p>
          <p>Length: {result.height} inches</p>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .container {
    display: flex;
    height: calc(100vh - 60px);
    overflow: hidden;
  }

  .sidebar-container {
    position: relative;
    width: 300px;
    transition: width 0.3s ease;
    margin-left: 0; /* Removida a margem à esquerda */
  }

  .sidebar-container.collapsed {
    width: 40px;
  }

  .sidebar {
    background-color: var(--surface-color);
    padding: 1rem;
    border-radius: 8px;
    overflow-y: auto;
    height: 100%;
    width: 300px;
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    margin-left: 30px; /* Este margin-left pode ser ajustado ou removido se necessário */
  }

  .upload-section, .select-pairs {
    margin-bottom: 1.5rem;
  }

  .upload-section > :global(*) {
    margin-bottom: 10px;
  }

  .pair-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .pair-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    font-size: 0.8em;
  }

  .thumbnail {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    margin-bottom: 4px;
  }

  .fancy-button {
    background-color: #808080;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.9em;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  }

  .fancy-button:hover {
    background-color: #666666;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
  }

  .process-button {
    width: 100%;
    margin-top: 1rem;
  }

  .select-all-checkbox {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    cursor: pointer;
    font-size: 0.9em;
    user-select: none;
  }

  .select-all-checkbox input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }

  .checkmark {
    position: relative;
    display: inline-block;
    height: 20px;
    width: 20px;
    background-color: #eee;
    border-radius: 4px;
    margin-right: 10px;
  }

  .select-all-checkbox:hover input ~ .checkmark {
    background-color: #ccc;
  }

 .select-all-checkbox input:checked ~ .checkmark {
  background-color: #4CAF50;
}

.select-all-checkbox .checkmark:after {
  content: "";
  position: absolute;
  display: none;
  left: 7px;
  top: 3px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.select-all-checkbox input:checked ~ .checkmark:after {
  display: block;
}

  .select-all-checkbox .checkmark:after {
    left: 7px;
    top: 3px;
    width: 5px;
    height: 10px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .toggle-sidebar {
    position: absolute;
    top: 10px;
    right: 5px;
    background-color: transparent;
    color: #808080;
    border: none;
    cursor: pointer;
    font-size: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    transition: background-color 0.3s ease;
  }

  .toggle-sidebar:hover {
    background-color: rgba(128, 128, 128, 0.2);
  }

  .toggle-sidebar .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .processed-pair {
    background-color: var(--surface-color);
    padding: 1rem;
    margin-bottom: 2rem;
    border-radius: 8px;
  }

  .image-container {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .image-container img {
    max-width: 45%;
    height: auto;
  }

  .result-info {
    display: flex;
    justify-content: space-between;
  }

  .pair-list {
    scrollbar-width: thin;
    scrollbar-color: #444 #2c2c2c;
  }

  .pair-list::-webkit-scrollbar {
    width: 8px;
  }

  .pair-list::-webkit-scrollbar-track {
    background: #2c2c2c;
  }

  .pair-list::-webkit-scrollbar-thumb {
    background-color: #444;
    border-radius: 4px;
    border: 2px solid #2c2c2c;
  }

  .pair-list::-webkit-scrollbar-thumb:hover {
    background-color: #555;
  }
</style>
