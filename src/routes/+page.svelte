<script>
  import { onMount } from 'svelte';
  import { writable, derived } from 'svelte/store';
  import FileUpload from '$lib/FileUpload.svelte';
  import { slide } from 'svelte/transition';

  const sampleFiles = writable([]);
  const manufacturerFiles = writable([]);
  const results = writable({});
  const pendingPairs = writable(new Set());
  const showSidebar = writable(true);

  function handleSampleUpload(files) {
    sampleFiles.set(Array.from(files));
    pendingPairs.set(new Set());
  }

  function handleManufacturerUpload(files) {
    manufacturerFiles.set(Array.from(files));
    pendingPairs.set(new Set());
  }

  async function processImages() {
    const $sampleFiles = get(sampleFiles);
    const $manufacturerFiles = get(manufacturerFiles);
    const $pendingPairs = get(pendingPairs);

    for (let i = 0; i < Math.min($sampleFiles.length, $manufacturerFiles.length); i++) {
      if ($pendingPairs.has(i)) {
        const formData = new FormData();
        formData.append('sample_image', $sampleFiles[i]);
        formData.append('manufacturer_image', $manufacturerFiles[i]);

        try {
          const response = await fetch('https://backend-flask-image.onrender.com/api/process_images', {
            method: 'POST',
            body: formData,
            headers: {
              'Accept': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
          }

          const result = await response.json();
          results.update(r => ({
            ...r,
            [i]: {
              sampleImage: $sampleFiles[i],
              manufacturerImage: $manufacturerFiles[i],
              scale: result.scale_inches_per_pixel,
              width: result.width,
              height: result.height,
              img_with_coin: result.img_with_coin,
              img_matches: result.img_matches
            }
          }));

          pendingPairs.update(pairs => {
            const newPairs = new Set(pairs);
            newPairs.delete(i);
            return newPairs;
          });
        } catch (error) {
          console.error(`Error processing pair ${i + 1}:`, error);
        }
      }
    }
  }

  function togglePair(index) {
    pendingPairs.update(pairs => {
      const newPairs = new Set(pairs);
      if (newPairs.has(index)) {
        newPairs.delete(index);
      } else {
        newPairs.add(index);
      }
      return newPairs;
    });
  }

  const bothUploadsCompleted = derived(
    [sampleFiles, manufacturerFiles],
    ([$sampleFiles, $manufacturerFiles]) => $sampleFiles.length > 0 && $manufacturerFiles.length > 0
  );

  const selectAll = derived(
    [bothUploadsCompleted, pendingPairs, manufacturerFiles],
    ([$bothUploadsCompleted, $pendingPairs, $manufacturerFiles]) => 
      $bothUploadsCompleted && $pendingPairs.size === $manufacturerFiles.length
  );

  function toggleAllPairs() {
    const $bothUploadsCompleted = get(bothUploadsCompleted);
    const $manufacturerFiles = get(manufacturerFiles);

    if (!$bothUploadsCompleted) return;

    pendingPairs.update(pairs => {
      if (pairs.size === $manufacturerFiles.length) {
        return new Set();
      } else {
        return new Set($manufacturerFiles.map((_, i) => i));
      }
    });
  }

  function toggleSidebar() {
    showSidebar.update(value => !value);
  }

  const thumbnailUrls = derived(
    manufacturerFiles,
    $manufacturerFiles => $manufacturerFiles.map(file => URL.createObjectURL(file))
  );
</script>

<div class="container">
  <div class="sidebar-container" class:collapsed={!$showSidebar}>
    {#if $showSidebar}
      <div class="sidebar" transition:slide={{ duration: 300, axis: 'x' }}>
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
          {#if $bothUploadsCompleted}
            <label class="select-all-checkbox">
              <input type="checkbox" bind:checked={$selectAll} on:change={toggleAllPairs}>
              <span class="checkmark"></span>
              Select All Pairs
            </label>
            <div class="pair-list">
              {#each $manufacturerFiles as file, index}
                <label class="pair-item">
                  <input type="checkbox" checked={$pendingPairs.has(index)} on:change={() => togglePair(index)}>
                  <img src={$thumbnailUrls[index]} alt="Thumbnail" class="thumbnail" />
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
      <span class="icon">{$showSidebar ? '◀' : '▶'}</span>
    </button>
  </div>

  <div class="main-content">
    {#each Object.entries($results) as [index, result]}
      <div class="processed-pair">
        <h3>Processed Pair {parseInt(index) + 1}</h3>
        <div class="image-container">
          <img src={`data:image/jpeg;base64,${result.img_with_coin}`} alt="Sample with Coin Detected" />
          <img src={`data:image/jpeg;base64,${result.img_matches}`} alt="Manufacturer with Matches" />
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
    margin-left: 0;
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
    margin-left: 30px;
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
