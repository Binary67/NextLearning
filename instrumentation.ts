export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startTutorialGenerationScheduler } = await import(
    "./lib/tutorial-background-generation"
  );

  await startTutorialGenerationScheduler();
}
