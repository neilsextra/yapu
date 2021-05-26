function Cloud() {}

function get_json_blob(token, container, blob) {
    return new Promise(accept => {
        var xhttp = new XMLHttpRequest();

        xhttp.open("GET", `/retreive?token=${encodeURIComponent(token)}&container=${encodeURIComponent(container)}&blob=${blob}`, true);

        xhttp.onreadystatechange = function() {

            if (this.readyState === 4 && this.status === 200) {

                accept(this.responseText);

            }

        }

        xhttp.send();

    });

}

Cloud.prototype.query = function(account, token, container, directory) {

    return new Promise(accept => {
        var xhttp = new XMLHttpRequest();

        xhttp.open("GET", `/query?account=${encodeURIComponent(account)}&token=${encodeURIComponent(token)}` +
            `&container=${encodeURIComponent(container)}&directory=${encodeURIComponent(directory)}`, true);

        xhttp.onreadystatechange = async function() {

            if (this.readyState === 4 && this.status === 200) {
                var paths = [];
                var response = JSON.parse(this.responseText);

                accept({
                    status: this.status,
                    paths: response[0]['paths']
                });

            } else if (this.status === 500) {

                alert(`Status: ${this.status} - ${this.statusText}`);

                accept({
                    status: this.status,
                    message: this.statusText
                });

            }

        };

        xhttp.send();

    });

}

Cloud.prototype.profile = function(account, token, container, directory, filename) {

    return new Promise(accept => {
        var xhttp = new XMLHttpRequest();

        xhttp.open("GET",
            `/profile?account=${encodeURIComponent(account)}&token=${encodeURIComponent(token)}&container=${encodeURIComponent(container)}` +
            `&directory=${encodeURIComponent(directory)}&filename=${encodeURIComponent(filename)}`, true);

        xhttp.onreadystatechange = async function() {

            if (this.readyState === 4 && this.status === 200) {
                var files = [];

                accept(this.responseText);

            } else if (this.status === 500) {

                alert(`Status: ${this.status} - ${this.statusText}`);

                accept({
                    status: this.status,
                    message: this.statusText
                });

            }

        };

        xhttp.send();

    });

}


Cloud.prototype.regenerate = function(account, token, container, directory, filename) {

    return new Promise(accept => {
        var xhttp = new XMLHttpRequest();

        xhttp.open("GET",
            `/regenerate?account=${encodeURIComponent(account)}&token=${encodeURIComponent(token)}&container=${encodeURIComponent(container)}` +
            `&directory=${encodeURIComponent(directory)}&filename=${encodeURIComponent(filename)}`, true);

        xhttp.onreadystatechange = async function() {

            if (this.readyState === 4 && this.status === 200) {
                var files = [];

                accept(this.responseText);

            } else if (this.status === 500) {

                alert(`Status: ${this.status} - ${this.statusText}`);

                accept({
                    status: this.status,
                    message: this.statusText
                });

            }

        };

        xhttp.send();

    });

}

Cloud.prototype.metadata = function(account, token, container, directory, filename) {

    return new Promise(accept => {
        var xhttp = new XMLHttpRequest();

        xhttp.open("GET",
            `/metadata?account=${encodeURIComponent(account)}&token=${encodeURIComponent(token)}&container=${encodeURIComponent(container)}` +
            `&directory=${encodeURIComponent(directory)}&filename=${encodeURIComponent(filename)}`, true);

        xhttp.onreadystatechange = async function() {

            if (this.readyState === 4 && this.status === 200) {
                var files = [];

                accept(this.responseText);

            } else if (this.status === 500) {

                alert(`Status: ${this.status} - ${this.statusText}`);

                accept({
                    status: this.status,
                    message: this.statusText
                });

            }

        };

        xhttp.send();

    });

}

Cloud.prototype.download = function(account, token, container, directory, filename) {

    fetch(`/download?account=${encodeURIComponent(account)}&token=${encodeURIComponent(token)}&container=${encodeURIComponent(container)}` +
            `&directory=${encodeURIComponent(directory)}&filename=${encodeURIComponent(filename)}`, {
                responseType: 'blob'
            })
        .then(res => res.blob())
        .then(blob => {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.setAttribute("download", "download.zip");
            a.click();
        });
}