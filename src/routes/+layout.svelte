<script>
  import '../app.css';
</script>

<div class="app-container">
  <header>
    <h1>Image Dimension App 🪁</h1>
  </header>
  
  <main>
    <slot />
  </main>
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: #1e1e1e;
    color: #ffffff;
  }

  header {
    background-color: #2c2c2c;
    padding: 1rem;
    text-align: center;
  }

  main {
    flex-grow: 1;
    padding: 0; /* Remove padding from main to ensure no margins */
    margin-top : 10px;
  }
</style>
