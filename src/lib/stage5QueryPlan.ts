export type Stage5QueryPlan = {
  isMainGridPage: boolean; isHallPage: boolean; isArchivePage: boolean;
  isDriverCharacterPage: boolean; isDriverCareerPage: boolean;
  isTeamSummaryPage: boolean; isTeamRegistrationPage: boolean; isTeamScoutPage: boolean; isTeamJobPage: boolean;
  isFinancialPage: boolean; isMemberAppealPage: boolean; isFiaAppealPage: boolean;
  isMainAnnouncementPage: boolean; isMainRegulationPage: boolean; isMainJobSearchPage: boolean; isFiaContentFormPage: boolean;
  isDriverProfilePage: boolean; isCompetitionPage: boolean; isCompetitionSchedulePage: boolean;
  needsOwnIdentity: boolean; needsSeasonData: boolean; needsTeamData: boolean; needsMemberDirectory: boolean; needsDirectoryAvatars: boolean;
  needsDivisionData: boolean; needsRoundData: boolean; needsRoundPoints: boolean; needsFinalStandings: boolean;
  needsRegistrationData: boolean; needsRaceResults: boolean; needsResultEntries: boolean; needsTeamProfiles: boolean;
  needsAttributes: boolean; needsAchievements: boolean; needsEngineData: boolean; needsJobAdverts: boolean;
  needsAppealData: boolean; needsContracts: boolean; needsWallets: boolean; needsFinancialLedger: boolean;
  needsDriverReputation: boolean; needsSponsorshipData: boolean;
};

export function createStage5QueryPlan(group: string, tab: string, detail: string, isAdmin = false): Stage5QueryPlan {
  const isMain = group === "main-event", isDriver = group === "driver-panel";
  const isTeam = group === "team-panel", isFia = group === "fia-panel";
  const isMainGridPage = isMain && ["global", "caleris-premio", "caleris-zwei"].includes(tab);
  const isHallPage = isMain && tab === "hall-of-fame";
  const isArchivePage = isMain && tab === "archive";
  const isDriverCharacterPage = isDriver && tab === "character";
  const isDriverCareerPage = isDriver && tab === "career-history";
  const isTeamSummaryPage = isTeam && tab === "team-summary";
  const isTeamRegistrationPage = isTeam && tab === "driver-registration";
  const isTeamScoutPage = isTeam && tab === "scout";
  const isTeamJobPage = isTeam && tab === "place-job-advert";
  const isFinancialPage = (isDriver || isTeam) && tab === "financial-centre";
  const isMemberAppealPage = (isDriver || isTeam) && tab === "appeal";
  const isFiaAppealPage = isFia && tab === "appeal-room" && isAdmin;
  const isMainAnnouncementPage = isMain && tab === "fia-announcement";
  const isMainRegulationPage = isMain && tab === "regulation";
  const isMainJobSearchPage = isMain && tab === "job-search";
  const isFiaContentFormPage = isFia && ["rules-input", "announcement-input"].includes(tab);
  const isDriverProfilePage = isDriverCharacterPage || isDriverCareerPage;
  const isCompetitionPage = isMainGridPage || isHallPage || isArchivePage;
  const isCompetitionSchedulePage = isMainGridPage && detail === "calendar";
  const needsOwnIdentity = isDriverProfilePage || isFinancialPage || isMemberAppealPage || isTeamSummaryPage || isTeamRegistrationPage || isTeamScoutPage || isTeamJobPage;
  const needsSeasonData = isCompetitionPage || isDriverProfilePage || isTeamSummaryPage || isTeamRegistrationPage || isTeamScoutPage || isTeamJobPage || isMainAnnouncementPage || isMainRegulationPage || isFiaContentFormPage;
  const needsTeamData = isCompetitionPage || isDriverProfilePage || isTeamSummaryPage || isTeamJobPage || isTeamScoutPage || isMainJobSearchPage || isFiaAppealPage;
  const needsMemberDirectory = isCompetitionPage || isDriverProfilePage || isTeamSummaryPage || isTeamRegistrationPage || isTeamScoutPage || isFiaAppealPage;
  const needsDirectoryAvatars = isMainGridPage && detail === "driver-list";
  const needsDivisionData = isCompetitionPage || isDriverProfilePage || isTeamSummaryPage || isTeamRegistrationPage;
  const needsRoundData = isMainGridPage || isArchivePage || isDriverProfilePage || isTeamSummaryPage;
  const needsRoundPoints = isMainGridPage || isDriverProfilePage || isTeamSummaryPage;
  const needsFinalStandings = isCompetitionPage || isDriverProfilePage || isTeamSummaryPage;
  const needsRegistrationData = isMainGridPage || isTeamRegistrationPage;
  const needsRaceResults = isMainGridPage || isArchivePage || isDriverProfilePage || isTeamSummaryPage;
  const needsResultEntries = needsRaceResults;
  const needsTeamProfiles = isMainGridPage || isTeamSummaryPage;
  const needsAttributes = isDriverCharacterPage || isTeamScoutPage;
  const needsAchievements = isDriverCharacterPage || isTeamSummaryPage || isHallPage;
  const needsEngineData = isMainGridPage;
  const needsJobAdverts = isMainJobSearchPage;
  const needsAppealData = isMemberAppealPage || isFiaAppealPage;
  const needsContracts = isDriverProfilePage || isTeamSummaryPage || isTeamScoutPage;
  const needsWallets = isFinancialPage || isDriverCharacterPage || isTeamSummaryPage;
  const needsFinancialLedger = isFinancialPage;
  const needsDriverReputation = isDriverCharacterPage || isTeamScoutPage;
  const needsSponsorshipData = isTeamSummaryPage;
  return {
    isMainGridPage, isHallPage, isArchivePage, isDriverCharacterPage, isDriverCareerPage,
    isTeamSummaryPage, isTeamRegistrationPage, isTeamScoutPage, isTeamJobPage, isFinancialPage,
    isMemberAppealPage, isFiaAppealPage, isMainAnnouncementPage, isMainRegulationPage,
    isMainJobSearchPage, isFiaContentFormPage, isDriverProfilePage, isCompetitionPage,
    isCompetitionSchedulePage, needsOwnIdentity, needsSeasonData, needsTeamData, needsMemberDirectory,
    needsDirectoryAvatars, needsDivisionData, needsRoundData, needsRoundPoints,
    needsFinalStandings, needsRegistrationData, needsRaceResults, needsResultEntries,
    needsTeamProfiles, needsAttributes, needsAchievements, needsEngineData, needsJobAdverts,
    needsAppealData, needsContracts, needsWallets, needsFinancialLedger,
    needsDriverReputation, needsSponsorshipData,
  };
}
