const app = new Vue({
    el: '#app',
    data: {
        currentPage: 1,
        maxPages: 1,
        token: null,
        gitlab: null,
        branch: null,
        projectId: null,
        projectName: null,
        nameWithNamespace: null,
        pipelines: [],
        jobNames: [],
        commitData: {},
        jobData: {}
    },
    created: function() {        
        var self = this
        self.initialize()
    },
    methods: {
        initialize: function() {
            var self = this
            self.pipelines = []
            self.jobNames = []
            self.commitData = {}
            self.jobData = {}
    
            self.loadConfig()
            self.setupDefaults()
            self.fetchProject()    
        },
        plusPage: function() {
            var self = this
            if (self.currentPage < self.maxPages) {
                self.currentPage += 1
                self.initialize()
            }
        },
        minusPage: function() {
            var self = this
            if (self.currentPage > 1) {
                self.currentPage -= 1
                self.initialize()
            }
        },
        loadConfig: function() {
            const self = this
            self.gitlab = getParameterByName("gitlab")
            self.token = getParameterByName("token")

            const project = getParameterByName("project").split('/')
            if (project.length < 3) {
              self.branch = ""
              self.projectName = project[project.length - 1].trim()
              self.nameWithNamespace = project.join('/')
            } else {
              self.branch = project[project.length - 1].trim()
              self.projectName = project[project.length - 2].trim()
              self.nameWithNamespace = project.slice(0, project.length - 1).join('/')
            }
        },
        setupDefaults: function() {
            if (this.token !== "use_cookie") {
              axios.defaults.baseURL = "https://" + this.gitlab + "/api/v4"
              axios.defaults.headers.common['PRIVATE-TOKEN'] = this.token
            } else {
              // Running on the GitLab-Server...
              axios.defaults.baseURL = "/api/v4"
              this.gitlab = location.hostname
            }
        },
        fetchProject: function() {
            const self = this
            axios.get('/projects/' + this.nameWithNamespace.replace(/[/]/g, '%2F'))
                .then(function (response) {
                    if (this.branch === "") {
                        this.branch = response.data.default_branch
                    }
                    self.projectId = response.data.id
                    self.fetchPipes()                   
                })
        },
        fetchPipes: function() {
            const self = this
            axios.get('/projects/' + self.projectId + '/pipelines/?ref=' + self.branch + '&page=' + self.currentPage)
              .then(function(pipes) {
                if ("x-total-pages" in pipes.headers) {
                    self.maxPages = parseInt(pipes.headers["x-total-pages"])
                }
                if (pipes.data.length === 0) {
                  return
                }
                for (i = 0; i < pipes.data.length; i++) {
                    const pipeInfo = {
                        sha: pipes.data[i].sha,
                        id: pipes.data[i].id,
                        status: pipes.data[i].status,
                        link: 'https://' + self.gitlab + '/' + self.nameWithNamespace + '/pipelines/' + pipes.data[i].id
                    }
                    self.pipelines.push(pipeInfo)
                    self.fetchJobs(pipeInfo.id)
                }
              })
        },
        fetchJobs: function(pipeId) {
            const self = this
            axios.get('/projects/' + self.projectId + '/pipelines/' + pipeId + '/jobs')
                .then(function(jobs) {
                    if (jobs.data.length === 0) {
                        return
                    }      
                    for (i = 0; i < jobs.data.length; i++) {
                        // job info
                        const jobInfo = {
                            id: jobs.data[i].id,
                            name: jobs.data[i].name,
                            stage: jobs.data[i].stage,
                            status: jobs.data[i].status,
                            started_at: jobs.data[i].started_at,
                            finished_at: jobs.data[i].finished_at,
                            link: 'https://' + self.gitlab + '/' + self.nameWithNamespace + '/-/jobs/' + jobs.data[i].id
                        }
                        comboName = jobInfo.stage + '$' + jobInfo.name
                        jobKey = pipeId + '$' + comboName
                        if (self.jobNames.indexOf(comboName) === -1) {
                            self.jobNames.push(comboName)
                        }
                        if (!(jobKey in self.jobData)) {
                            Vue.set(self.jobData, jobKey, jobInfo)
                        }
                        // commit info
                        const title = jobs.data[i].commit.title
                        commitData = {
                            sha: jobs.data[i].commit.id,
                            shortSha: jobs.data[i].commit.short_id,
                            title: title,
                            shortTitle: (title.length < 30 ? title : title.substring(0, 30 - 3) + '...')
                        }
                        if (!(commitData.sha in self.commitData)) {
                            Vue.set(self.commitData, commitData.sha, commitData)
                        }
                    }
                })
        },
        getJobStatus: function (key) {
            const self = this
            if (key in self.jobData) {
                return self.jobData[key].status
            }
            else {
                return ''
            }
        },      
        getJobLink: function (key) {
            const self = this
            if (key in self.jobData) {
                return self.jobData[key].link
            }
            else {
                return ''
            }
        },
        getJobCaption: function (key) {
            const self = this
            if (key in self.jobData) {
                if (self.jobData[key].started_at === null && self.jobData[key].finished_at === null) {
                    return ''
                }else if (self.jobData[key].finished_at === null) {
                    const duration = new Date() - new Date(self.jobData[key].started_at)
                    return self.getDuration(duration)
                }else {
                    const duration = new Date(self.jobData[key].finished_at) - new Date(self.jobData[key].started_at)
                    return self.getDuration(duration)
                }               
            }
            else {
                return ''
            }
        },
        getDuration: function (duration) {
            const self = this
            const seconds = Math.floor(duration / 1000);
            return self.leadZero(Math.floor(seconds / 3600)) 
                + ':' + self.leadZero(Math.floor((seconds % 3600) / 60)) 
                + ':' + self.leadZero(seconds % 60)
        },
        leadZero: function(n) {
            return (n == 0) ? ("00") : ((n < 10) ? ("0" + n) : n)
        },
        getPipeCaption: function (key) {
            const self = this
            if (key in self.commitData) {
                return self.commitData[key].shortTitle
            }
            else {
                return key
            }
        }
    }
})
