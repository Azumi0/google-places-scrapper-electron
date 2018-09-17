const electron = require('electron');
const jQuery = require('jquery');
// const remote = require('remote');
const path = require('path');
const fs = require('fs');

const { ipcRenderer, remote } = electron;
const dialog = remote.dialog;

jQuery(window).on('load', () => {
  const $ = jQuery;

  $('#exportForm').on('submit', (e) => {
    e.preventDefault();

    dialog.showSaveDialog({
      filters: [
        {
          name: 'Arkusz xlsx MS Excel',
          extensions: ['xlsx'],
        },
      ],
    }, (savePath) => {
      if (savePath === undefined) return;

      const saveDirname = path.dirname(savePath);
      fs.access(saveDirname, fs.constants.W_OK, (err) => {
        if (err) {
          dialog.showErrorBox('Błąd zapisu pliku', 'Nie można zapisać pliku w wybranym miejscu - brak dostępu.');

          return;
        }

        $('#mainPreloader').show();

        const keywords = $('#keywords').val();
        const city = $('#city').val();

        ipcRenderer.send('scrape:start', {
          savePath,
          keywords,
          city,
        });
      });
    });
  });

  ipcRenderer.on('scrape:finish', (e, result) => {
    $('#mainPreloader').hide();

    if (result.success) {
      dialog.showMessageBox({
        message: 'Eksport wizytówek zakończony powodzeniem!',
        buttons: ['OK'],
      });
    } else {
      dialog.showErrorBox('Błąd exportu', `Wystąpił błąd podczas eksportu.\nOtrzymaliśmy następujący błąd: ${result.message}`);
    }
  });
});
