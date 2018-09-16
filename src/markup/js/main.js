const electron = require('electron');
const jQuery = require('jquery');

const { ipcRenderer } = electron;

jQuery(window).on('load', () => {
  const $ = jQuery;

  $('#exportForm').on('submit', (e) => {
    e.preventDefault();

    $('#mainPreloader').show();

    const keywords = $('#keywords').val();
    const city = $('#city').val();

    ipcRenderer.send('scrape:start', {
      keywords,
      city,
    });
  });
});
