import mongoose from "mongoose";

async function run() {
  for (const dbName of ["ai-todosync", "pristine"]) {
    const MONGODB_URI = `mongodb://localhost:27017/${dbName}`;
    await mongoose.connect(MONGODB_URI);
    console.log(`\n=================== DB: ${dbName} ===================`);

    const integrations = await mongoose.connection.db
      ?.collection("sdkintegrations")
      .find()
      .toArray();
    console.log("SDK Integrations:");
    for (const i of integrations || []) {
      console.log(`- ID: ${i._id}, Name: ${i.name}, Status: ${i.status}`);
      console.log(
        `  Count: ${i.connectionCount}, Ver: ${i.sdkVersion}, Origin: ${i.latestOrigin}`,
      );
      console.log(
        `  LastConnect: ${i.lastConnectedAt}, Heartbeat: ${i.lastHeartbeatAt}`,
      );
      console.log(
        `  RuntimeReq: ${i.lastRuntimeRequestAt}, EventReq: ${i.lastEventRequestAt}`,
      );
    }

    const guides = await mongoose.connection.db
      ?.collection("guides")
      .find()
      .toArray();
    console.log("Guides:");
    for (const g of guides || []) {
      console.log(
        `- ID: ${g._id}, Title: ${g.title}, Type: ${g.type}, Status: ${g.status}`,
      );
    }

    const surveys = await mongoose.connection.db
      ?.collection("surveys")
      .find()
      .toArray();
    console.log("Surveys:");
    for (const s of surveys || []) {
      console.log(`- ID: ${s._id}, Title: ${s.title}`);
    }

    const exposures = await mongoose.connection.db
      ?.collection("guideexposures")
      .find()
      .toArray();
    console.log("Exposures:");
    for (const e of exposures || []) {
      console.log(
        `- ID: ${e._id}, GuideId: ${e.guideId}, Status: ${e.status}, DisplayCount: ${e.displayCount}`,
      );
    }

    await mongoose.disconnect();
  }
}

run().catch(console.error);
