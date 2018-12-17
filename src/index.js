import { app, BrowserWindow, ipcMain } from 'electron';
import locutusEmpty from "locutus/php/var/empty";
import xl from 'excel4node';

const googleMapsClient = require('@google/maps').createClient({
  key: '***REMOVED***',
  Promise: Promise,
});

const googleMapsPlacesFiledsMapping = {
  name: 'nazwa',
  route: 'ulica',
  street_number: 'numer domu',
  locality: 'miasto',
  postal_code: 'kod pocztowy',
  country: 'kraj',
  formatted_phone_number: 'numer telefonu',
  website: 'adres strony www',
  url: 'link do wizytówki',
  rating: 'ocena miejsca',
};

const parseAddressComponents = (data) => {
  const final = {};

  if (locutusEmpty(data)) {
    return final;
  }

  data.map((el) => {
    final[el.types[0]] = el.long_name;
  });

  return final;
};

const TYPES = {
  undefined: 'undefined',
  number: 'number',
  boolean: 'boolean',
  string: 'string',
  '[object Function]': 'function',
  '[object RegExp]': 'regexp',
  '[object Array]': 'array',
  '[object Date]': 'date',
  '[object Error]': 'error',
};
const valueType = o => (TYPES[typeof o] || TYPES[Object.prototype.toString.call(o)] || (o ? 'object' : 'null'));

const getSafeErrorValue = (element) => {
  const type = valueType(element);

  if (type === 'string') {
    return element;
  }

  if (type === 'array') {
    return element.join(', ');
  }

  if (type === 'boolean') {
    return (element ? 'true' : 'false');
  }

  if (type === 'date') {
    return element.toString();
  }

  if (type === 'number' || type === 'null') {
    return element;
  }

  if (element.toString) {
    return element.toString();
  }

  if (element.message) {
    return element.message;
  }

  if (type === 'object') {
    return element;
  }

  if (type === 'undefined') {
    return 'undefined';
  }

  return '';
};

const sleep = (milliseconds) => {
  const start = new Date().getTime();

  for (let i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
};

const fetchListings = (parameters, nextPageToken = null, retryCount = 0) => {
  const reqParams = (nextPageToken === null) ? parameters : {
    pagetoken: nextPageToken,
  };

  return new Promise((fetchListingsResolve, fetchListingsReject) => {
    googleMapsClient.places(reqParams)
      .asPromise()
      .then((responsePlaces) => {
        const fetchPromises = [];

        responsePlaces.json.results.map((el) => {
          fetchPromises.push(googleMapsClient.place({
            placeid: el.place_id,
            language: 'pl',
          }).asPromise());
        });

        Promise.all(fetchPromises).then((fethedData) => {
          if (locutusEmpty(responsePlaces.json.next_page_token)) {
            return fetchListingsResolve(fethedData);
          }

          sleep(1500);
          fetchListings(parameters, responsePlaces.json.next_page_token).then((nextPageData) => {
            fetchListingsResolve(fethedData.concat(nextPageData));
          }).catch((nextPageDetails) => {
            const typeErr = valueType(nextPageDetails);
            let messageErr = nextPageDetails;

            if (typeErr === 'object') {
              if (!locutusEmpty(nextPageDetails.json.status)) {
                messageErr = nextPageDetails.json.status;
              }
            }

            if (messageErr === 'INVALID_REQUEST') {
              sleep(1500);
              fetchListings(parameters, responsePlaces.json.next_page_token).then((retryNextPageData) => {
                fetchListingsResolve(fethedData.concat(retryNextPageData));
              }).catch((retryNextPageDetails) => {
                fetchListingsReject(retryNextPageDetails);
              });
            } else {
              fetchListingsReject(nextPageDetails);
            }
          });
        }).catch((errDetails) => {
          fetchListingsReject(errDetails);
        });
      })
      .catch((errPlaces) => {
        fetchListingsReject(errPlaces);
      });
  });
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: `${__dirname}/markup/icon.png`,
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/markup/index.html`);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// https://www.youtube.com/watch?v=kN1Czs0m1SU
// https://github.com/bradtraversy/electronshoppinglist

ipcMain.on('scrape:start', (e, data) => {
  googleMapsClient.geocode({
    address: data.city,
  }).asPromise()
    .then((response) => {
      const geocode = response.json.results[0].geometry.location;

      fetchListings({
        query: data.keywords,
        language: 'pl',
        location: [geocode.lat, geocode.lng],
        radius: data.radius,
      }).then((fethedData) => {
        const wb = new xl.Workbook();
        const ws = wb.addWorksheet('Sheet 1');
        let rowIndex = 1;

        Object.entries(googleMapsPlacesFiledsMapping).map((mapEntry, mapIndex) => {
          ws.cell(rowIndex, (mapIndex + 1)).string(mapEntry[1]);
        });

        rowIndex += 1;

        fethedData.map((fetchedRecord) => {
          if (parseInt(fetchedRecord.status) === 200) {
            const parsedRecord = Object.assign(
              parseAddressComponents(fetchedRecord.json.result.address_components),
              fetchedRecord.json.result,
            );

            Object.entries(googleMapsPlacesFiledsMapping)
              .map((mapEntry, mapIndex) => {
                ws.cell(rowIndex, (mapIndex + 1))
                  .string((locutusEmpty(parsedRecord[mapEntry[0]])) ? '' : String(parsedRecord[mapEntry[0]]));
              });

            rowIndex += 1;
          }
        });

        wb.write(data.savePath);

        mainWindow.webContents.send('scrape:finish', {
          success: true,
          message: '',
        });
      })
      .catch((errPlaces) => {
        const typeErrPlaces = valueType(errPlaces);
        let messageErrPlaces = errPlaces;

        if (typeErrPlaces === 'object') {
          if (!locutusEmpty(errPlaces.json.status)) {
            messageErrPlaces = errPlaces.json.status;
          }
        }

        mainWindow.webContents.send('scrape:finish', {
          success: false,
          message: getSafeErrorValue(messageErrPlaces),
        });
      });
    })
    .catch((err) => {
      const typeErr = valueType(err);
      let messageErr = err;

      if (typeErr === 'object') {
        if (!locutusEmpty(err.json.status)) {
          messageErr = err.json.status;
        }
      }

      mainWindow.webContents.send('scrape:finish', {
        success: false,
        message: getSafeErrorValue(messageErr),
      });
    });
});
