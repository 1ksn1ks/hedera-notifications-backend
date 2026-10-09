// Prints the real reason if the server dies during import or startup.
console.log(
  `boot node ${process.version} port=${process.env.PORT || "(unset)"} data=${process.env.NOTIFIER_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || "(default)"}`
);
try {
  await import("./index.js");
} catch (err) {
  console.error("backend failed to start");
  console.error(err);
  process.exit(1);
}
