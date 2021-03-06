import 'dotenv/config'
import {RingApi} from "ring-client-api";
import {discovery, v3, api} from "node-hue-api";
import {getSunriseSunsetInfo} from "sunrise-sunset-api";

(async () => {
    console.log('Hello, world!');
    console.log(`Hue username: ${process.env.HUE_USERNAME.substring(0, 8)}...`);
    console.log(`Hue client key: ${process.env.HUE_CLIENT_KEY.substring(0, 8)}...`);
    console.log(`Ring refresh token: ${process.env.RING_REFRESH_TOKEN.substring(0, 8)}...`);

    console.log('Searching for a hue hub..');
    let hueSearchResults = await discovery.upnpSearch();
    if (hueSearchResults.length === 0) {
        console.log('Couldn\'t find any hue hub.');
        process.exit(1);
    }

    let hueHost = hueSearchResults[0].ipaddress;
    console.log(`Found hue hub with IP ${hueHost}. Connecting..`);

    const hueHub = await v3.api
        .createLocal(hueHost)
        .connect(process.env.HUE_USERNAME, process.env.HUE_CLIENT_KEY);
    console.log('Connected to hue hub.');

    console.log('Connecting to ring api..');
    const ringApi = new RingApi({refreshToken: process.env.RING_REFRESH_TOKEN});
    console.log('Connected to ring api.');

    let cameras = await ringApi.getCameras();
    console.log(`Found ${cameras.length} camera(s).`);

    let camera = cameras.filter(c => c.name === process.env.RING_CAMERA_NAME)[0];
    if (camera === undefined) {
        console.log('Couldn\'t find the desired ring camera.');
        process.exit(1);
    }

    console.log(`Found camera ${camera.name}. Now listening to events!`);

    let turnOffTimeout: NodeJS.Timeout | undefined = undefined;

    const lightNames = process.env.HUE_LIGHTS.split(',');
    const lengthMs = parseInt(process.env.LIGHT_ON_TIME) * 1000;

    camera.onNewNotification.subscribe(async (notification) => {
        if (notification.subtype === 'human') {
            console.log('Human detected!');

            if(!await isSunDown()) {
                console.log('The sun is still up. Doing nothing.');
                return;
            }

            if(await isLightsOn(hueHub, lightNames)) {
                if(turnOffTimeout === undefined) {
                    console.log('Lights are already turned on manually. Doing nothing.');
                    return;
                }else{
                    console.log('Lights are already turned on automatically. Canceling old turn-off timer.');

                    clearTimeout(turnOffTimeout);
                    turnOffTimeout = undefined;
                }
            }else{
                await setLightsOn(hueHub, lightNames, true);
                console.log(`Turned lights on.`);
            }

            console.log(`Started timer to turn off lights in ${lengthMs / 1000} seconds.`);
            turnOffTimeout = setTimeout(async () => {
                await setLightsOn(hueHub, lightNames, false);
                console.log('Turned lights off.');

                turnOffTimeout = undefined;
            }, lengthMs);
        }
    });
})();

async function setLightsOn(hueHub: any, lightNames: string[], on: boolean) {
    let lights: any[] = await hueHub.lights.getAll();
    lights = lights.filter(l => lightNames.indexOf(l.name) !== -1);

    for(let light of lights) {
        const state = new v3.lightStates.LightState()
            .on(on);

        hueHub.lights.setLightState(light.id, state)
            .catch(console.error);
    }
}

async function isLightsOn(hueHub: any, lightNames: string[]) {
    let lights: any[] = await hueHub.lights.getAll();
    lights = lights.filter(l => lightNames.indexOf(l.name) !== -1);

    for(let light of lights) {
        let state: any = await hueHub.lights.getLightState(light.id);
        if(state.on) {
            return true;
        }
    }

    return false;
}

async function isSunDown() {
    const response = await getSunriseSunsetInfo({
        latitude: parseFloat(process.env.LATITUDE),
        longitude: parseFloat(process.env.LONGITUDE),
        formatted: false,
    });

    let sunrise = new Date(response.sunrise);
    let sunset = new Date(response.sunset);
    let now = new Date();

    return !(now > sunrise && now < sunset);
}
